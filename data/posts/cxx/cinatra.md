[TOC]

# cinatra代码梳理

## 简介
最近想做个东西暂定使用ASIO。本着不重复造轮子的精神(轮子造的没别人好)，最终决定使用[cinatra](https://github.com/qicosmos/cinatra)，顺带学习一下c++17。cinatra是基于boost::asio开发的高性能httpserver，包括文件上传、websocket，而且是headonly非常方便。至于性能，贴一张github上不知道几年前的bench图。
![Local image](data/posts/img/cinatra_bench.png)

## Demo1
简单几行代码就能启动http服务并监听8080端口，同时支持post、get请求
```c++
int main() {
    int max_thread_num = std::thread::hardware_concurrency();
    http_server server(max_thread_num);
    server.listen("0.0.0.0", "8080");
    server.set_http_handler<GET, POST>("/", [](request& req, response& res) {
      res.set_status_and_content(status_type::ok, "hello world");
    });
    server.run();
    return 0;
  }
```

在`http_server`的构造函数调用`init_conn_callback`，注册`http_handler_`。这个`http_handler_`很重要，他最终会通过`http_router_.route`执行`main`函数中注册的那个回调。
```c++
template <typename ScoketType, class service_pool_policy = io_service_pool>
class http_server_ : private noncopyable {
public:
  using type = ScoketType;
  template <class... Args>
  explicit http_server_(Args &&... args)
      : io_service_pool_(std::forward<Args>(args)...) {
    http_cache::get().set_cache_max_age(86400);
    init_conn_callback();
  }
  void init_conn_callback() {
    set_static_res_handler();
    http_handler_ = [this](request &req, response &res) {
      res.set_headers(req.get_headers());
      try {
        bool success =
            http_router_.route(req.get_method(), req.get_url(), req, res);
        if (!success) {
          if (not_found_) {
            not_found_(req, res);
            return;
          }
          res.set_status_and_content(status_type::bad_request,
                                     "the url is not right");
        }
      } catch (const std::exception &ex) {
        res.set_status_and_content(
            status_type::internal_server_error,
            ex.what() + std::string(" exception in business function"));
      } catch (...) {
        res.set_status_and_content(status_type::internal_server_error,
                                   "unknown exception in business function");
      }
    };
  }
};
```

`server.listen("0.0.0.0", "8080");`执行`start_accept`，`start_accept`本身异步执行因此可以同时处理多个请求。`start_accept`中的`new_conn->start()`会调用接收请求数据的函数接口。
```c++
 std::pair<bool, std::string>
  listen(const boost::asio::ip::tcp::resolver::query &query) 
  {
    .........
      try 
      {
        acceptor->bind(endpoint);
        acceptor->listen();
        start_accept(acceptor);
        r = true;
      } catch (const std::exception &ex) {
      }
      .........
    }
    
    void start_accept(
      std::shared_ptr<boost::asio::ip::tcp::acceptor> const &acceptor) {
    auto new_conn = 
    acceptor->async_accept(
        new_conn->tcp_socket(),
        [this, new_conn, acceptor](const boost::system::error_code &e) {
          if (!e) {
            if (!on_conn_) {
              new_conn->start();
            } else {
              if (on_conn_(new_conn)) {
                new_conn->start();
              }
            }
          }
          start_accept(acceptor);
        });
  }
```

`new_conn->start()`调用`do_read()`调用`async_read_some()`调用`handle_read`调用`handle_request`。`handle_request`函数则最终负责处理不同的`content_type`请求;
```c++
  void handle_request(std::size_t bytes_transferred) {
    if (req_.has_body()) {
      auto type = get_content_type();
      req_.set_http_type(type);
      switch (type) {
      case cinatra::content_type::string:
      case cinatra::content_type::unknown:
        handle_string_body(bytes_transferred);
        break;
      case cinatra::content_type::multipart:
        handle_multipart();
        break;
      case cinatra::content_type::octet_stream:
        handle_octet_stream(bytes_transferred);
        break;
      case cinatra::content_type::urlencoded:
        handle_form_urlencoded(bytes_transferred);
        break;
      case cinatra::content_type::chunked:
        handle_chunked(bytes_transferred);
        break;
      }
    } else {
      handle_header_request();
    }
  }
```

以`handle_header_request`为例：
```c++
void handle_header_request() {
.........
call_back();
if (!res_.need_delay())
  do_write();
.........
}
```

`handle_header_request`调用`call_back`调用`http_handler_(req_, res_);`此处的`http_handler_`就是`init_conn_callback`中注册的`http_handler_`。最后调用`do_write`调用`asio::async_write`返回请求结果，至此整个流程结束。  
前面说过`http_handler_`执行`http_router_.route`，而`http_router_.route`最终执行的是`main`中注册的回调，下面来看看`main`中的回调是怎么注册到`http_router_.route`中的。  
`main`中执行`set_http_handler`调用`http_router_.register_handler`调用`register_member_func`，最终将回调注册到`map_invokers_`中。
```c++
template <http_method... Is, typename Function, typename... AP>
void set_http_handler(std::string_view name, Function &&f, AP &&... ap) {
if constexpr (has_type<enable_cache<bool>,
                       std::tuple<std::decay_t<AP>...>>::value) { // for cache
  auto tp = filter<enable_cache<bool>>(std::forward<AP>(ap)...);
  auto lm = [this, name, f = std::move(f)](auto... ap) {
    http_router_.register_handler<Is...>(name, std::move(f),
                                         std::move(ap)...);
  };
  std::apply(lm, std::move(tp));
} else {
  http_router_.register_handler<Is...>(name, std::forward<Function>(f),
                                       std::forward<AP>(ap)...);
}
}
template<typename Function, typename Self, typename... AP>
void register_member_func(std::string_view raw_name, const std::array<char, 26>& arr, Function f, Self self, const AP&... ap) {
  if (raw_name.back() == '*') {
    this->wildcard_invokers_[raw_name.substr(0, raw_name.length() - 1)] = { arr, std::bind(&http_router::invoke_mem<Function, Self, AP...>, this,
      std::placeholders::_1, std::placeholders::_2, f, self, ap...) };
  }
  else {
    this->map_invokers_[raw_name] = { arr, std::bind(&http_router::invoke_mem<Function, Self, AP...>, this,
      std::placeholders::_1, std::placeholders::_2, f, self, ap...) };
  }
}
```

`http_router_.route()`会查找`map_invokers_`，通过执行`pair.second(req, res)`执行`main`中注册的回调
```c++
bool route(std::string_view method, std::string_view url, request& req, response& res) {
  auto it = map_invokers_.find(url);
  if (it != map_invokers_.end()) {
    pair.second(req, res);
    return true;
  }
  else {
  }
}
```

至此整个通信已经形成闭环。request、handle、response的关键代码也已经找到，对我来说已经足够二次开发了。以后若有需要再另开一贴深入研究。
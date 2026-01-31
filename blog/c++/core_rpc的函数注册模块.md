[TOC]

# core_rpc之函数注册
## 函数注册模块
函数注册代码很简洁，除了比cinatra的函数注册多一个序列化步骤，其余地方有很多相似之处核心思想都是通过function实现类型擦除，调用时通过函数类型萃取再将参数复原，基本使用如下
```
inline std::string_view echo(std::string_view str) 
{ 
    return str; 
}

void core_rpc_server_test()
{
    coro_rpc::coro_rpc_server server(/*thread_num =*/10, /*port =*/9000);
    server.register_handler<echo>(); // register function echo
    auto err = server.start(); // start the server & block
}
```

```coro_rpc_server```中有个```server_config::rpc_protocol::router```的成员变量。这里的```server_config::rpc_protocol```由```coro_rpc_server```定义,展开得到```config::coro_rpc_default_config::coro_rpc::protocol::coro_rpc_protocol```。在```coro_rpc_protocol```中又定义了```coro_rpc::protocol::router<coro_rpc_protocol> router_```，所以绕了一圈，```server_config::rpc_protocol::router```最终指的是router.hpp中的```coro_rpc::protocol::router```。```server.register_handler<echo>()```最终也是调用```router```类中的```register_handler()```方法。

```register_handler```函数的功能是将多个func展开，通过```regist_one_handler```逐一注册，核心还是```regist_one_handler```函数。```regist_one_handler```首先通过```concept```判断类型模板参数```rpc_protocol```是否含有```gen_register_key```方法，这里的类型模板参数```rpc_protocol```指的是```coro_rpc::protocol::coro_rpc_protocol```。没有的话就使用通用```auto_gen_register_key```生成一个key，然后注册。
```
template <auto func>
void regist_one_handler() {
route_key key{};
if constexpr (has_gen_register_key<rpc_protocol, func>) {
  key = rpc_protocol::template gen_register_key<func>();
}
else {
  key = auto_gen_register_key<func>();
}
regist_one_handler_impl<func>(key);
}
```

```auto_gen_register_key```主要分2步，第一步通过函数名字计算那么，第2步通过name经由hash得到32位无符号整形的id。在编译期通过```__PRETTY_FUNCTION__```获取括函数类型的模板参数等基本信息，再通过字符串查找截取等方法将目标函数名取出。

```regist_one_handler_impl```执行真正的函数注册功能,包括协程函数注册和普通函数注册，这里暂时只讨论普通函数的实现。注册的函数由```std::unordered_map<route_key, router_handler_t> handlers_;```维护，unordered_map中的```route_key```上一步计算得到的id，而```router_handler_t```通过```std::function```实现函数类型擦除，定义如下：
```
using router_handler_t = std::function<std::optional<std::string>(
  std::string_view, rpc_context<rpc_protocol> &context_info,
  typename rpc_protocol::supported_serialize_protocols protocols)>;
```
可以看到```router_handler_t```的定义中没有任何和rpc函数相关的影子，那是因为rpc函数在添加到```handlers_```时通过lambda表达式进行了类型擦除。如下：
```
auto it = handlers_.emplace(
  key,
  [](std::string_view data, rpc_context<rpc_protocol> &context_info,
     typename rpc_protocol::supported_serialize_protocols protocols) {
    return std::visit(
        [data, &context_info]<typename serialize_protocol>(
            const serialize_protocol &obj) mutable {
          return internal::execute<rpc_protocol, serialize_protocol,
                                   func>(data, context_info);
        },
        protocols);
  });
```
类型擦除的关键是将rpc函数作为模板参数传入到lambda表达式里面，当执行rpc调用时通过SFINAE技术提取函数参数类型和函数返回类型，比如：
```
template <typename This, typename Return, typename... Arguments>
struct function_traits<Return (This::*)(Arguments...) const> {
  using parameters_type = std::tuple<std::remove_cvref_t<Arguments>...>;
  using return_type = Return;
  using class_type = This;
};
```
再通过struck_pack将请求参数反序列化，接着调用rpc函数，最后序列化函数返回值：
```
using param_type = function_parameters_t<T>;
auto args = get_args<has_coro_conn_v, param_type>();
serialize_proto::deserialize_to(args, data);
if(std::is_void_v<return_type>)
	std::apply(func, std::move(args));
else
	return serialize_proto::serialize(std::apply(func, std::move(args)));
```
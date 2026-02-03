# core_rpc之协程模块
core_rpc中的协程模块使用的是另一个ali的开源库asynic_simple。asynic_simple由c++20中的coroutines实现，所以这里主要介绍asynic_simple的实现结构。async_simple::coro::Lazy是项目中使用最多的协程对象，下面具体分析一下他的代码实现。
![Local image](data/posts/img/core_rpc_lazy.png)
## 协程对象Lazy
c++20的协程，裸露一点的写法是`std::coroutine_handle<promise_type>.resume()`恢复协程，封装一个`Type GetValue()`直接获取`return_value()`的运行结果。但在asynic_simple中这些均是通过awaiter完成，以Lazy中的start方法举例来说`TryAwaiter`的`await_suspend`返回被调用的协程句柄。编译器遇到返回协程句柄的`std::coroutine_handle<> await_suspend(std::coroutine_handle<> h)`会调用该句柄的`resume()`方法直接恢复拥有该句柄的协程，指恢复被调用协程继续运行。被调用协程运行完之后调用`FinalAwaiter`中的`await_suspend`恢复调用协程`DetachedCoroutine`,最后调用方协程继续执行`await_resume`用于获取协程结果。这里就可以把awaiter当成事件理解，通过不同的awaiter驱动同一个协程对象。
### promise_type
`LazyPromiseBase`中定义的`final_suspend`方法返回自定义Awaiter对象`FinalAwaiter`，用来resume caller。

```
struct FinalAwaiter {
bool await_ready() const noexcept { return false; }
template <typename PromiseType>
auto await_suspend(std::coroutine_handle<PromiseType> h) noexcept {
  return h.promise()._continuation;
}
void await_resume() noexcept {}
};
```

`LazyPromise`通过使用`std::variant`储存协程对象打返回值或者异常值,最终再通过result方法获取协程返回值。
```
template <typename T>
class LazyPromise : public LazyPromiseBase {
...
template <typename V, typename = std::enable_if_t<std::is_convertible_v<V&&, T>>>
void return_value(V&& value) noexcept(
  std::is_nothrow_constructible_v<T, V&&>) {
_value.template emplace<T>(std::forward<V>(value));
}
void unhandled_exception() noexcept {
_value.template emplace<std::exception_ptr>(std::current_exception());
}
	std::variant<std::monostate, T, std::exception_ptr> _value;
...
}
```
### awaiter/awaitable
在asynic_simple中可通过co_await关键字或syncAwait同步获得协程结果。syncAwait方法调用了lazy类的start方法。核心是传入一个`Try<value_type>`形参的表达式，通过`TryAwaiter`将结果取出。而对于协程嵌套协程这种模式，比如在一个协程中`co_await coroutinestask;`,通过`LazyPromiseBase`的`await_transform`实现。在协程嵌套情况下，编译器首先会判断协程对象有没有实现`await_transform`方法，如果实现了就会使用`await_transform`返回的awaiter对象。`co_await coroutinestask`时通过`std::enable_if_t`判断`coroutinestask`是否有`coAwait`方法，此处lazy类实现了`coAwait`方法，所以最终调用自身的coAwait方法返回`ValueAwaiter`对象。
```
template <typename Awaitable>
auto await_transform(Awaitable&& awaitable) {
// See CoAwait.h for details.
return detail::coAwait(_executor, std::forward<Awaitable>(awaitable));
}
template <typename Awaitable, std::enable_if_t<detail::HasCoAwaitMethod<Awaitable>::value, int> = 0>
inline auto coAwait(Executor* ex, Awaitable&& awaitable) {
    return std::forward<Awaitable>(awaitable).coAwait(ex);
}
```
用来获取awaitable对象。`LazyBase`也实现了ValueAwaiter和TryAwaiter。
### 带参数的noexcept
如果noexcept(true)，则不会抛出异常，反之则可能有异常。在`LazyPromise`中有：
```
void return_value(V&& value) noexcept(
  std::is_nothrow_constructible_v<T, V&&>) {
_value.template emplace<T>(std::forward<V>(value));
}
```
### Using-declaration
这里有个知识点，Lazy的实现中使用了`using Base::Base;`。目的是继承构造函数。通过这种方法，编译器可自动添加父类的构造函数方法。
```
struct B1 { B1(int, ...) {} };
int get();
 
struct D1 : B1
{
    using B1::B1; // inherits B1(int, ...)
    int x;
    int y = get();
};
 
void test()
{
    D1 d(2, 3, 4); // OK: B1 is initialized by calling B1(2, 3, 4),
                   // then d.x is default-initialized (no initialization is performed),
                   // then d.y is initialized by calling get()
 
    D1 e;          // Error: D1 has no default constructor
}
```
## ThreadPool
线程池的基本功能都大同小异，获取cpu个数、绑定cpu等等，不一样的地方是这里的ThreadPool实现了指定线程运行函数功能和任务偷取的功能，任务偷取在[work steal线程池](http://www.purecpp.cn/detail?id=2286)中有介绍。这里有一个不明白的地方为什么不执行自己的任务，再偷取别的队列？按正常逻辑应该是自己没任务处理了再偷取其他队列更符合常理啊。
## SimpleExecutor
一个Executor的简单实现
## RescheduleLazy
带了Executor的Lazy，通过Lazy的`via(Executor* ex)`创建。Executor用于提交异步请求，有自己的线程池，其中`checkout()`用于获取线程id、`checkin(...)`用于将方法提交到特定线程执行
## collectAll
通过`co_await CollectAllAwaiter`实现。在`await_suspend`中利用lazy的`start`方法执行所有的任务。在`start`中填入捕捉了`detail::CountEvent`的lambda表达式，该lambda表达式除了需要收集计算结果，也需要重新resume协程，resume的协程句柄在`await_suspend`的后面通过`_event.setAwaitingCoro(continuation);`设置。如果需要并发的`collectAll`要提前指定`executor`对象。
```
inline void await_suspend(std::coroutine_handle<> continuation) {
    auto promise_type =
        std::coroutine_handle<LazyPromiseBase>::from_address(
            continuation.address())
            .promise();
            ...
}
```
这里有一点看不明白，不懂为什么先`address`后`from_address`，为什么不能直接`continuation.promise()`

## collectAny
实现和collectAll类似，需要特别注意的是一但any result得到之后调用栈将会销毁，所以栈中的局部变量也会销毁。所以在collectAny中需要通过指针管理result和detail::CountEvent。

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

`coro_rpc_server`中有个`server_config::rpc_protocol::router`的成员变量。这里的`server_config::rpc_protocol`由`coro_rpc_server`定义,展开得到`config::coro_rpc_default_config::coro_rpc::protocol::coro_rpc_protocol`。在`coro_rpc_protocol`中又定义了`coro_rpc::protocol::router<coro_rpc_protocol> router_`，所以绕了一圈，`server_config::rpc_protocol::router`最终指的是router.hpp中的`coro_rpc::protocol::router`。`server.register_handler<echo>()`最终也是调用`router`类中的`register_handler()`方法。

`register_handler`函数的功能是将多个func展开，通过`regist_one_handler`逐一注册，核心还是`regist_one_handler`函数。`regist_one_handler`首先通过`concept`判断类型模板参数`rpc_protocol`是否含有`gen_register_key`方法，这里的类型模板参数`rpc_protocol`指的是`coro_rpc::protocol::coro_rpc_protocol`。没有的话就使用通用`auto_gen_register_key`生成一个key，然后注册。
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

`auto_gen_register_key`主要分2步，第一步通过函数名字计算那么，第2步通过name经由hash得到32位无符号整形的id。在编译期通过`__PRETTY_FUNCTION__`获取括函数类型的模板参数等基本信息，再通过字符串查找截取等方法将目标函数名取出。

`regist_one_handler_impl`执行真正的函数注册功能,包括协程函数注册和普通函数注册，这里暂时只讨论普通函数的实现。注册的函数由`std::unordered_map<route_key, router_handler_t> handlers_;`维护，unordered_map中的`route_key`上一步计算得到的id，而`router_handler_t`通过`std::function`实现函数类型擦除，定义如下：
```
using router_handler_t = std::function<std::optional<std::string>(
  std::string_view, rpc_context<rpc_protocol> &context_info,
  typename rpc_protocol::supported_serialize_protocols protocols)>;
```
可以看到`router_handler_t`的定义中没有任何和rpc函数相关的影子，那是因为rpc函数在添加到`handlers_`时通过lambda表达式进行了类型擦除。如下：
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

## 参考
- [Using-declaration](https://en.cppreference.com/w/cpp/language/using_declaration)
- [async_simple](https://alibaba.github.io/async_simple/docs.en/GetStarted.html)
- [noexcept](https://www.cnblogs.com/Asp1rant/p/15505532.html)
- [c++20_Coroutines入门](http://www.aiecent.com/articleDetail?article_id=47)
- [brpc中的任务偷取](http://www.aiecent.com/articleDetail?article_id=66#workstealingqueue)
- [work steal线程池](http://www.purecpp.cn/detail?id=2286)
- [CGraph的线程池优化](http://www.chunel.cn/archives/cgraph-threadpool-1-introduce)
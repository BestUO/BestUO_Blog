# c++20_Coroutines入门

## 简介
功能与异步编程相似不阻塞程序运行。但是可以在某个地方挂起，并且可以重新在挂起处恢复运行。协程与线程最大不同之处在于调度模式。线程通过操作系统切换内核栈上下文切换线程，从而执行不同的函数。协程通过编程者切换自己保存的用户栈切换协程任务，从而执行不同的函数。

## 使用场景
* 回调多，一个操作需要依赖另外一个操作的场景。当然std::packaged_task，std::promise用也可以实现类似功能，但是用户线程需要等待：
```C++
template <class F, class... Args>
auto EnqueueFun(F&& f, Args&&... args)
    -> std::future<typename std::result_of<F(Args...)>::type>
{
    using return_type = typename std::result_of<F(Args...)>::type;
    auto task         = std::make_shared<std::packaged_task<return_type()>>(
        std::bind(std::forward<F>(f), std::forward<Args>(args)...));

    std::future<return_type> res = task->get_future();
    while (!__queue->AddObj([task]() {
        (*task)();
    }))
    {
        if (__totalnum < __maxsize)
            CreateWorker(false).detach();
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    return res;
}
std::future<int> rt = pool.EnqueueFun(requestA，1);
rt = pool.EnqueueFun(requestB，rt.get());
rt = pool.EnqueueFun(requestC，rt.get());
```

* io密集型业务场景，这是协程最大的优势了。可以在等待io的时候暂停该协程，处理下一个协程任务。待io完成之后继续处理未完成的协程任务，因此性能很高。[libgo](https://github.com/yyzybb537/libgo)中采用的方式是hook系统同步函数比如poll，read，write，accept等，然后加入到自己的异步epoll中。

## 基本写法
* 协程函数必须包含`co_wait`,`co_return`,`co_yield`其中一个
* 返回类型需要满足Promise的规范,拥有promise_type结构体，并至少包含如下5个函数。
```c++
template<class T>
struct generator
{
    struct promise_type;
    using handle = std::coroutine_handle<promise_type>;
    struct promise_type
    {
        T _current_value;
        auto get_return_object() { return generator<T>{handle::from_promise(*this)}; }
        auto initial_suspend() { return std::suspend_always{}; }
        auto final_suspend() noexcept { std::cout << "final_suspend" << std::endl;return std::suspend_always{}; }
        void unhandled_exception() { std::terminate();}
	    //根据协程函数是否有返回值，选取return_void或者return_value方法，只能二选一。
	    // void return_void() {}
	    void return_value(T value) {_current_value = value;}
	    /*一下函数可有可无*/
	    //用于co_yield
	    auto yield_value(T value)
        {
            _current_value = value;
            return std::suspend_always{};
        }
    };
    ...
}
//简单定义协程函数
generator<int> f()
{
	std::cout << "begin coroutines" << std::endl;
    co_yield 1;
    co_yield 5;
    co_return 11;
}
int main()
{
    auto g = f();
    while (g.move_next())
        std::cout << g.current_value() << std::endl;
    std::cout << g.current_value() << std::endl;
    return 0;
}
```

## promise简介
f()拥有`co_yield`,`co_return`关键字，同时回返结构体`generator<int>`满足Promise规范，所以f()是一个协程函数。在编译阶段，编译器会将协程函数编译成如下形式。
```c++
generator<T> f() 
{
	__f_context* __context = new __f_context{};
	__return = __context->_promise.get_return_object();
	co_await promise.initial_suspend();
	try
	{  
		<body-statements>
		//co_await __context->_promise->yield_value("1");
		//co_await __context->_promise->yield_value("5");
		//__context->_promise->return_value(11); goto final_suspend_label;
	}
	catch (...)
	{
		promise.unhandled_exception();
	}
	FinalSuspend:
		co_await promise.final_suspend();
}
```
`get_return_object`用于创建返回值对象，此处是`generator<T>`。`initial_suspend`用于判断协程是否一启动就suspend。此处`initial_suspend`返回`std::suspend_always`。`std::suspend_always`是一个awaitable对象，可以被co_await。`unhandled_exception`用于处理异常，`final_suspend`判断结束前是否需要挂起，此处同样返回`std::suspend_always`。c++20实现的协程，真正的挂起恢复操作通过co_await实现。不难发现promise对象可以控制协程挂起恢复，并将异常结果传递给外部系统。另一点需要注意，promise_type本身是支持构造函数重载的。[参照此处文档](https://hackmd.io/@redbeard0531/S1H_loeA7?type=view)构造promise_type对象时会传入协程函数的参数，类似这样：
```c++
MyCoroType func(Args... args) {
...
    auto promise = PromiseType(args...);
    auto my_handle = std::coroutine_handle<PromiseType>::from_promise(promise);
    auto protoReturnValue = promise.get_return_object();
...
}
```

## co_await简介
真正对协程实行挂起暂停操作的是co_await，Awaitable和Awaiter都支持co_await操作。Awaiter类型必须支持await_ready，await_suspend和await_resume三种方法，例如`std::suspend_always`，重载co_await操作的称之为Awaitable类型:
```c++
struct dummy { // Awaitable
    std::suspend_always operator co_await(){ return {}; }
};
struct suspend_always {//Awaiter
	constexpr bool await_ready() const noexcept { return false; }
	constexpr void await_suspend(coroutine_handle<>) const noexcept {}
	constexpr void await_resume() const noexcept {}
};
```
当遇到`co_await <expr>`表达式时，编译器做的第一件事是获取等待值的Awaiter对象。如果promise类型P有一个名为await_transform 的成员，那么 <expr> 首先被传递给promise.await_transform（<expr>）以获得 Awaitable 的值。 否则，如果promise 类型没有await_transform成员，那么我们使用直接评估 <expr>的结果作为Awaitable对象。然后，如果Awaitable对象有一个可用的运算符co_await()重载，那么调用它来获取 Awaiter对象。否则awaitable的对象被用作awaiter对象。编译器会将代码改写为如下形式：
```c++
{
	template<typename P, typename T>
	decltype(auto) get_awaitable(P& promise, T&& expr)
	{
	  if constexpr (has_any_await_transform_member_v<P>)
	    return promise.await_transform(static_cast<T&&>(expr));
	  else
	    return static_cast<T&&>(expr);
	}
	 
	template<typename Awaitable>
	decltype(auto) get_awaiter(Awaitable&& awaitable)
	{
	  if constexpr (has_member_operator_co_await_v<Awaitable>)
	    return static_cast<Awaitable&&>(awaitable).operator co_await();
	  else if constexpr (has_non_member_operator_co_await_v<Awaitable&&>)
	    return operator co_await(static_cast<Awaitable&&>(awaitable));
	  else
	    return static_cast<Awaitable&&>(awaitable);
	}

	auto&& value = <expr>;
	auto&& awaitable = get_awaitable(promise, static_cast<decltype(value)>(value));
	auto&& awaiter = get_awaiter(static_cast<decltype(awaitable)>(awaitable));
	if (!awaiter.await_ready())
	{
		<suspend-coroutine>

		//if await_suspend returns void
		try {
		    awaiter.await_suspend(coroutine_handle);
		    return_to_the_caller();
		} catch (...) {
		    exception = std::current_exception();
		    goto resume_point;
		}
		//endif
		//if await_suspend returns bool
		bool await_suspend_result;
		try {  
		    await_suspend_result = awaiter.await_suspend(coroutine_handle);
		} catch (...) {
		    exception = std::current_exception();
		    goto resume_point;
		}
		if (not await_suspend_result)
		    goto resume_point;
		return_to_the_caller();
		//endif
		//if await_suspend returns another coroutine_handle
		decltype(awaiter.await_suspend(std::declval<coro_handle_t>())) another_coro_handle;
		try {
		    another_coro_handle = awaiter.await_suspend(coroutine_handle);
		} catch (...) {
		    exception = std::current_exception();
		    goto resume_point;
		}
		another_coro_handle.resume();
		return_to_the_caller();
		//endif
	}
	resume_point:
		if(exception)
			std::rethrow_exception(exception);
		return awaiter.await_resume();
}
```

* `await_ready()`方法判断是否需要挂起，若为 true 则无需挂起
* `suspend-coroutine`中编译器会生成保存当前协程状态以及挂起恢复位置的代码
* 判断await_suspend()的返回值类型：
	* void，无返回值，直接挂起返回 caller
	* bool，若为 true，则返挂起返回 caller，否则不挂起，直接 resume
	* coroutine_handle<>, 则挂起并将控制权转移到另一个协程上，另一个协程可以再 resume 回来，到达resume_point。
* `return-to-caller-or-resumer`真正挂起协程的位置
* `await_resume()`恢复协程，同时返回结果。await_resume函数允许拥有任意的返回值类型，模板类型也是允许的。所以写可以这样灵活使用：
```c++
template <class T>
struct someAsyncOpt {
 bool await_ready()
 void await_suspend(std::coroutine_handle<>);
 T await_resume();
};
```

综上，如下代码经过编译器编译后会被改写为：
```c++
//原始：
// g++-10 -std=c++20 -fcoroutines -fno-exceptions -o myapp Main.cpp
#include <coroutine>
#include <iostream>
struct HelloWorldCoro {
    struct promise_type { // compiler looks for `promise_type`
        HelloWorldCoro get_return_object() { return this; }    
        std::suspend_always initial_suspend() { return {}; }        
        std::suspend_always final_suspend() { return {}; }
    };
    HelloWorldCoro(promise_type* p) : m_handle(std::coroutine_handle<promise_type>::from_promise(*p)) {}
    ~HelloWorldCoro() { m_handle.destroy(); }
    std::coroutine_handle<promise_type>      m_handle;
};
HelloWorldCoro print_hello_world() {
    std::cout << "Hello ";
    co_await std::suspend_always{};
    std::cout << "World!" << std::endl;
}
int main() {
    HelloWorldCoro mycoro = print_hello_world();
    mycoro.m_handle.resume();
    mycoro.m_handle(); // Equal to mycoro.m_handle.resume();
    return EXIT_SUCCESS;
}
//改写为：
HelloWorldCoro print_hello_world() {
    __HelloWorldCoro_ctx* __context = new __HelloWorldCoro_ctx{};
    auto __return = __context->_promise.get_return_object();
    {
        auto&& awaiter = std::suspend_always{};
        if (!awaiter.await_ready()) {
            awaiter.await_suspend(std::coroutine_handle<> p); 
            // compiler added suspend/resume hook
        }
        awaiter.await_resume();
    }
    std::cout << "Hello ";
    {
        auto&& awaiter = std::suspend_always{};
        if (!awaiter.await_ready()) {
            awaiter.await_suspend(std::coroutine_handle<> p); 
            // compiler added suspend/resume hook
        }
        awaiter.await_resume();
    }
    std::cout << "World!" << std::endl;
__final_suspend_label:
    {
        auto&& awaiter = std::suspend_always{};
        if (!awaiter.await_ready()) {
            awaiter.await_suspend(std::coroutine_handle<> p); 
            // compiler added suspend/resume hook
        }
        awaiter.await_resume();
    }
    return __return;
}
```

## demo
1. [c++20协程简单demo](https://github.com/BestUO/littletools/tree/master/coroutinestest)

## 参考
2. [c++20协程入门](https://zhuanlan.zhihu.com/p/59178345)  
3. [C++20 协程初探](https://netcan.github.io/2020/09/05/C-20%E5%8D%8F%E7%A8%8B/)  
4. [C++20 Coroutine实例教学](https://zhuanlan.zhihu.com/p/414506528)  
5. [C++20 新特性 协程 Coroutines(1)](https://zhuanlan.zhihu.com/p/349210290)  
6. [C++20 新特性 协程 Coroutines(2)](https://zhuanlan.zhihu.com/p/349710180)  
7. [C++20 新特性 协程 Coroutines(3)](https://zhuanlan.zhihu.com/p/356752742)  
8. [协程简介](https://lewissbaker.github.io/)  
9. [译 C++ 协程 1：协程理论](https://blog.csdn.net/sinat_17700695/article/details/115770430?spm=1001.2014.3001.5502)  
10. [译 C++ 协程 2：理解 co_await 运算符](https://juejin.cn/post/6844903715099377672)  
11. [译 C++ 协程 3：理解 promise type](https://blog.csdn.net/sinat_17700695/article/details/116016136)  
12. [Understanding C++ coroutines by example](https://downloads.ctfassets.net/oxjq45e8ilak/4kVoTkxYBiVM9lPBZiG2HO/a5e36dc80fd898885269bd6320c96196/Pavel_Novikov_Uchimsya_gotovit_C_korutiny_na_praktike_2020_06_28_18_49_49.pdf)  
13. [C++20 Coroutine: Under The Hood](http://www.vishalchovatiya.com/cpp20-coroutine-under-the-hood/)  
14. [C++ coroutines: Short-circuiting suspension](https://devblogs.microsoft.com/oldnewthing/20191216-00/?p=103217)  
15. [C++20 Coroutines — Complete Guide](https://itnext.io/c-20-coroutines-complete-guide-7c3fc08db89d)  
16. [C++20 — Practical Coroutines](https://itnext.io/c-20-practical-coroutines-79202872ebba)  
17. [协程池实现](https://zhuanlan.zhihu.com/p/375279181)  
18. [使用c++20协程和epoll封装简单网络库(一) 使用协程](https://zhuanlan.zhihu.com/p/430014469)  
19. [使用c++20协程和epoll封装简单网络库(二) co_await](https://zhuanlan.zhihu.com/p/432627058)  
20. [async_simple](https://github.com/alibaba/async_simple)  
21. [asyncio](https://github.com/netcan/asyncio)  
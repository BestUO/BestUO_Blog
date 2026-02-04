[TOC]
# netcan_asyncio之task_test

## asyncio::Task
以`asyncio::run(coro_depth_n<1>(result))`为例,编译器将代码展开为如下形式：
```C++
Task<T> coro_depth_n<1>(result) 
{
    __f_context* __context = new __f_context{};
    __return = __context->_promise.get_return_object();
    co_await promise.initial_suspend();                         //说明1
    try
    {  
        result.push_back(1);
        X=coro_depth_n<0>										//说明2
        co_await X;												//说明3
        result.push_back(10);
    }
    catch (...)
    {
        promise.unhandled_exception();
    }
    FinalSuspend:
        co_await promise.final_suspend();
}
```

* 说明1
`co_await promise.initial_suspend();`执行完后挂起，返回task协程对象。通过schedule加入到协程ready_队列，而后通过run_until_complete函数resume协程运行try中的body。

* 说明2
编译器同样展开协程函数，遇到initial_suspend()返回协程对象Task，编译器展开如下：
```C++
Task<T> coro_depth_n<0>(result) 
{
    __f_context* __context = new __f_context{};
    __return = __context->_promise.get_return_object();
    co_await promise.initial_suspend();
    try
    {  
        result.push_back(0);
    }
    catch (...)
    {
        promise.unhandled_exception();
    }
    FinalSuspend:
        co_await promise.final_suspend();                            //说明5
}
```

* 说明3
协程对象X实现了`await_transform`和`operator co_await()`，co_await X将被改写为以下形式，awaiter由operator co_await()提供
```c++
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
            awaiter.await_suspend(coroutine_handle);              //说明4
            return_to_the_caller();
        } catch (...) {
            exception = std::current_exception();
            goto resume_point;
        }
    	...
    }
    resume_point:
        if(exception)
            std::rethrow_exception(exception);
        return awaiter.await_resume();
```

* 说明4
保存当前协程栈为self_coro_.promise().continuation_，并调用Task中的AwaiterBase将self_coro_.promise().schedule()加入到协程ready_队列.而后协程暂停返回，调用者继续运行run_until_complete，resume说明2中暂定的协程，并执行说明2中的co_await promise.final_suspend();

* 说明5
说明2中`co_await promise.final_suspend()`具体代码如下。如果有continuation_那么将continuation_加入ready_队列并结束当前协程。此处的continuation_就是coro_depth_n<1>的协程句柄，最终通过resume恢复说明3中暂停的协程。
```c++
struct FinalAwaiter {
    constexpr bool await_ready() const noexcept { return false; }
    template<typename Promise>
    constexpr void await_suspend(std::coroutine_handle<Promise> h) const noexcept {
        if (auto cont = h.promise().continuation_) {
            get_event_loop().call_soon(*cont);
        }
    }
    constexpr void await_resume() const noexcept {}
};
auto final_suspend() noexcept {
    return FinalAwaiter {};
}
```

## asyncio::sleep
通过调用call_at将任务添加到schedule_，run_once()中的selector_.select触发定时器
```c++
void call_at(std::chrono::duration<Rep, Period> when, Handle& callback) {
    callback.set_state(Handle::SCHEDULED);
    schedule_.emplace_back(duration_cast<MSDuration>(when),
                           HandleInfo{callback.get_handle_id(), &callback});
    std::ranges::push_heap(schedule_, std::ranges::greater{}, &TimerHandle::first);
}
```
以下代码为例：
协程函数async_main运行时首先创建两个schedule_task对象task1，task2。注意此时task1,task2均被Task中的initial_suspend阻塞。因此运行位置到达co_await task1，保存async_main协程状态并退出。继续运行EventLoop::run_until_complete()。注意此时schedule_队列中有两个协程任务task1,task2。因为task2任务sleep100ms，所以先打印world，后打印hello。task1任务完成后执行final_suspend继续async_main，执行co_await task2。await_ready返回ture，async_main结束。
```c++
GIVEN("schedule sleep and await") {
    auto async_main = [&]() -> Task<> {
        auto task1 = schedule_task(say_after(200ms, "hello"));
        auto task2 = schedule_task(say_after(100ms, "world"));

        co_await task1;
        co_await task2;
    };
    auto before_wait = get_event_loop().time();
    asyncio::run(async_main());
    auto after_wait = get_event_loop().time();
    auto diff = after_wait - before_wait;
    REQUIRE(diff >= 200ms);
    REQUIRE(diff < 300ms);
    REQUIRE(call_time == 2);
}
```

## asyncio::gather
用于获取所有协程的结果，高度模板化值得学习。`gather(Futs&&... futs)`是一个普通函数，用于返回协程对象。
```c++
template<concepts::Awaitable... Futs>
[[nodiscard("discard gather doesn't make sense")]]
auto gather(Futs&&... futs) {
    return detail::gather(no_wait_at_initial_suspend, std::forward<Futs>(futs)...);
}
```

在创建协程对象的过程中通过NoWaitAtInitialSuspend关键字重载promise_type构造函数使得Task中initial_suspend的await_ready返回true，直接运行函数体`co_return co_await GatherAwaiterRepositry { std::forward<Futs>(futs)... };`。
```c++
template<concepts::Awaitable... Futs>
auto gather(NoWaitAtInitialSuspend, Futs&&... futs) // need NoWaitAtInitialSuspend to lift futures lifetime early
-> Task<std::tuple<GetTypeIfVoid_t<AwaitResult<Futs>>...>> { // lift awaitable type(GatherAwaiterRepositry) to coroutine
    co_return co_await GatherAwaiterRepositry { std::forward<Futs>(futs)... };
}
```

从GatherAwaiterRepositry重载的co_await操作符返回awaiter对象GatherAwaiter
```c++
auto operator co_await() && {
    return std::apply([]<concepts::Awaitable... F>(F&&... f) {
        return GatherAwaiter { std::forward<F>(f)... };
    }, std::move(futs_));
}
```

通过c++17的推导指南获取GatherAwaiter模板所需的类型[推导指南](http://www.aiecent.com/articleDetail?article_id=49#deduction-guides)
```c++
template<concepts::Awaitable... Futs> // C++17 deduction guide
GatherAwaiter(Futs&&...) -> GatherAwaiter<AwaitResult<Futs>...>;
```

构造GatherAwaiter对象，展开协程参数，通过collect_result将协程赋值给成员变量`std::tuple<Task<std::void_t<Rs>>...> tasks_;`
```c++
template<concepts::Awaitable... Futs, size_t ...Is>
explicit GatherAwaiter(std::index_sequence<Is...>, Futs&&... futs)
        : tasks_{ std::make_tuple(collect_result<Is>(no_wait_at_initial_suspend, std::forward<Futs>(futs))...) }
        { }
```

注意collect_result本身也是一个initial_suspend中await_ready返回true的协程，因此直接执行函数体。在执行函数体的过程中遇到co_await std::forward<Fut>(fut)，执行Task中的await_transform流程，将真正的任务协程加入ready_队列（上文asyncio::Task中已介绍），任务完成后通过is_finished()判断是否将collect_result加入到ready_队列以继续gather协程的运行。注意在for循环执行ready_队列的过程中，可能有新得协程加入到ready_队列，这时候通过ntodo来区分ready队列的处理批次，每次for循环都认为是同一批。
```c++
template<size_t Idx, concepts::Awaitable Fut>
Task<> collect_result(NoWaitAtInitialSuspend, Fut&& fut) {
    try {
        auto& results = std::get<ResultTypes>(result_);
        if constexpr (std::is_void_v<AwaitResult<Fut>>) 
            { co_await std::forward<Fut>(fut); }
        else 
            { std::get<Idx>(results) = std::move(co_await std::forward<Fut>(fut)); }
        ++count_;
    } catch(...) {
        result_ = std::current_exception();
    }
    if (is_finished()) {
        get_event_loop().call_soon(*continuation_);
    }
}
```

## asyncio::wait_for
实现超时取消功能，原理同gather类似。创建WaitForAwaiter对象的时候初始化timeout_handle_和wait_for_task_，timeout_handle_用于创建超时处理的协程，wait_for_task_用于处理真正的协程任务
```c++
struct WaitForAwaiter: NonCopyable 
{
    ...
    template<concepts::Awaitable Fut>
    WaitForAwaiter(Fut&& fut, Duration timeout)
            : timeout_handle_(*this, timeout)
            , wait_for_task_ {
                schedule_task(wait_for_task(no_wait_at_initial_suspend,
                             std::forward<Fut>(fut)))
            } { }

    struct TimeoutHandle: Handle {
        TimeoutHandle(WaitForAwaiter& awaiter, Duration timeout)
        : awaiter_(awaiter) {
            get_event_loop().call_later(timeout, *this);
        }
        void run() final { // timeout!
            awaiter_.wait_for_task_.cancel();
            awaiter_.result_.set_exception(std::make_exception_ptr(TimeoutError{}));

            get_event_loop().call_soon(*awaiter_.continuation_);
        }

        WaitForAwaiter& awaiter_;
    } timeout_handle_;

    template<concepts::Awaitable Fut>
    Task<> wait_for_task(NoWaitAtInitialSuspend, Fut&& fut) {
        try {
            if constexpr (std::is_void_v<R>) { co_await std::forward<Fut>(fut); }
            else { result_.set_value(co_await std::forward<Fut>(fut)); }
        } catch(...) {
            result_.unhandled_exception();
        }
        EventLoop& loop{get_event_loop()};
        loop.cancel_handle(timeout_handle_);
        if (continuation_) {
            loop.call_soon(*continuation_);
        }
    }
}
```
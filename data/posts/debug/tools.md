## 生成core
1. `ulimit -c unlimited`
2. `sudo sh -c 'echo "core-%e-%p-%t" > /proc/sys/kernel/core_pattern'`

## 运行时生成core
1. `gcore pid`

## strace
[简单介绍1](https://blog.csdn.net/mijichui2153/article/details/85229307)	
[简单介绍2](https://www.cnblogs.com/machangwei-8/p/10388883.html)	

* 程序无法启动，通过strace查看执行哪一步时出错		
strace -o strace.log -tt ./app
* 线程卡主，查看卡在哪里	
strace -p 17553

## pstack
* 查看线程运行位置,跟踪进程栈	
pstack pid

## 查看网络流量
### netstat
```
netstat -i //按网卡分的网络流量统计
netstat -s //按协议分的网络流量统计
netstat -antup //a:所有连线中的Socket,n:直接使用IP地址,tu:tcp/udp,p:程序名和pid
```

## 测试工具
### doctest
[repository](https://github.com/doctest/doctest/blob/master/doc/markdown/tutorial.md)
[demo](https://github.com/BestUO/littletools/blob/master/examples/tooltest.cpp)
```C++
TEST_CASE("testing TimerManager AddAlarm DeleteAlarm") 
{
    struct Key
    {
        std::string name;   
        int id;
    };

    auto fun2 = [](int a, int b)
    {
        std::cout << a << '\t' << b << std::endl;
    };
    TimerManager<Key> *tm = TimerManager<Key>::GetInstance();
    for(int i=5;i<10;i++)
        tm->AddAlarm(std::chrono::system_clock::now()+std::chrono::seconds(2), Key{"123",i}, std::bind(fun2,i,i+1));
    CHECK(tm->DeleteAlarm(std::bind([](const Key& t, int id){ return t.id == id; },std::placeholders::_1, 7)) == true );
    sleep(3);
    tm->StopTimerManager();
}

/*
output:
[doctest] doctest version is "2.4.9"
[doctest] run with "--help" for options
5       6
6       7
8       9
9       10
===============================================================================
[doctest] test cases: 1 | 1 passed | 0 failed | 0 skipped
[doctest] assertions: 1 | 1 passed | 0 failed |
[doctest] Status: SUCCESS!
*/
```

## 在线耗时分析
* https://quick-bench.com/q/bLmEQIyt-7utcuY8_m1aWRyBg_M
* https://www.perfbench.com/

## 本地耗时分析
### [nanobench](https://github.com/martinus/nanobench)
```C++
ankerl::nanobench::Bench().run("DeleteAlarm cost time",[&]()
{
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
});
/*
output:
Recommendations
* Use 'pyperf system tune' before benchmarking. See https://github.com/psf/pyperf

|               ns/op |                op/s |    err% |     total | benchmark
|--------------------:|--------------------:|--------:|----------:|:----------
|      100,141,400.00 |                9.99 |    0.0% |      1.10 | `DeleteAlarm cost time`
*/
```
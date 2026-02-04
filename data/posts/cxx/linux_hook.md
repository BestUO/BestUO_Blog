[TOC]

# Linux Hook

## 简介
代理模式可以让我们在不改变原始类模块的基础上添加新功能。Hook和代理模式相似，他可以帮助我们代理系统函数比如read、write、键盘输入，鼠标点击等。

## LD_PRELOAD方式
LD_PRELOAD是个环境变量用于动态库的加载，动态库加载的优先级最高，一般情况下，其加载顺序为LD_PRELOAD > LD_LIBRARY_PATH > /etc/ld.so.cache > /lib>/usr/lib。具体可以参考[这篇文章](https://www.netspi.com/blog/technical/network-penetration-testing/function-hooking-part-i-hooking-shared-library-function-calls-in-linux/)类似这样:
```c++
export LD_PRELOAD=./libhook.so
./main
```

坏处是会影响之后整个系统的库函数调用，当然可以通过这样处理达到仅对当前程序生效：
```c++
LD_PRELOAD=./libhook.so ./main`。
```

虽然对系统影响小了，但仍然需要设置`LD_PRELOAD`环境变量。

## LD_LIBRARY_PATH方式
可以直接通过`./main`运行，但是编译期需加上自己编译的hook库。顺带一提libgo中的hook就是使用这种方式。
本文作者仿照libgo写了一个简单demo，hook了系统sleep函数。  
[demo](https://github.com/BestUO/littletools/tree/master/hooktest)直接sh hook.sh即可
```c++
unsigned int sleep(unsigned int seconds)
{
    if(!sleep_f)
        doInitHook();
    printf("oops!!! hack function invoked\n");
    return sleep_f(seconds);
}
class thirdso
{
public:
	bool mystrcmp(std::string s)
	{
	    sleep(1);
	    return true;
	};
};
int main()
{
    thirdso test;
    std::cout << "-------------begin initHook" << std::endl;
    std::cout << test.mystrcmp("test1") << std::endl;

    initHook();
    std::cout << "-------------after initHook" << std::endl;
    std::cout << test.mystrcmp("test1") << std::endl;
    return 0;
}

output:
-------------begin initHook
oops!!! hack function invoked
1
-------------after initHook
oops!!! hack function invoked
1
```
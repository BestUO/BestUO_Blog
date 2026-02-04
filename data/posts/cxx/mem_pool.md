# Memory pool
之前简单介绍了brpc中的object pool和resource pool。理论结合实践，这里实现一个简单的版本。

## 内存模型内存顺序
1. [聊聊内存模型与内存序](https://mp.weixin.qq.com/s/t5_Up2YZEZt1NLbvgYz9FQ)
2. [C++11的6种内存序总结](https://blog.csdn.net/mw_nice/article/details/84861651)
| 内存序 | 保证 | 性能 | 适用场景 |
|---|---|---|---|
| **memory_order_relaxed** | 无同步保证，只保证原子操作的原子性 | 最高 | 计数器、统计值等不需要同步的场景 |
| **memory_order_consume** | 数据依赖关系上的顺序保证 | 较高 | <span style="color:red">不推荐使用（已被弃用趋势）</span> |
| **memory_order_acquire** | 当前读取操作之后的所有读写操作不会被重排到该读取操作之前 | 中等 | 读取共享数据，需要看到其他线程的写入 |
| **memory_order_release** | 当前写入操作之前的所有读写操作不会被重排到该写入操作之后 | 中等 | 写入共享数据，让其他线程能看到 |
| **memory_order_acq_rel** | 同时具有acquire和release的意义 | 中等 | 读-修改-写操作（如CAS） |
| **memory_order_seq_cst** | 最强的顺序保证，所有线程看到的操作顺序一致 | 最低 | **默认选项**，需要严格顺序的场景 |

## 内存对齐
读取内存的最小单元是caheline，cacheline大小一般为64，所以存在伪共享。在多线程环境下伪共享可能成为性能瓶颈，可以通过结构体的内存对齐以空间换时间解决伪共享问题。需要注意的是c++的#pragma pack(n)强调的是成员之间的偏移地址所以不能解决伪共享问题，而__attribute__((__aligned__(n)))强调的是对象在内存的地址,可以解决该问题。但是c++11中的齐描述符alignas可以实现同样的效果

```C++
#define RTE_CACHE_LINE_SIZE 64
#define __rte_cache_aligned __attribute__((__aligned__(RTE_CACHE_LINE_SIZE)))

struct ex1
{
  char a;
  int b;
  double e;
  char d;
  int c;
}__attribute__((__aligned__(2)));

#pragma pack(2)
struct ex2
{
  char a;
  int b;
  double e;
  char d;
  int c;
};
#pragma pack()

struct ex3
{
  char a __attribute__((__aligned__(64)));
  int b __attribute__((__aligned__(64)));
  ex2 e2 __attribute__((__aligned__(64)));
  int c __attribute__((__aligned__(64)));
};

ex1 e1;
ex2 e2;
ex3 e3;

std::cout << sizeof(e1) << std::endl; //out 24
std::cout << sizeof(e2) << std::endl; //out 20
std::cout << sizeof(e3) << std::endl; //out 256
```

## placement new重复构造
A * a=new A;实际上执行如下3个过程:   
1. 调用operator new分配内存，operator new (sizeof(A))。
2. 调用构造函数生成类对象，A::A()    
3. 返回相应指针

operator new是函数，分为三种形式（前2种不调用构造函数，这点区别于new operator
```C++
//A* a = new A; //分配size个字节的存储空间，并将对象类型进行内存对齐。如果成功，返回一个非空的指针指向首地址。失败抛出bad_alloc异常。
void* operator new (std::size_t size) throw (std::bad_alloc);
//A* a = new(std::nothrow) A; //在分配失败时不抛出异常，它返回一个NULL指针。  
void* operator new (std::size_t size, const std::nothrow_t& nothrow_constant) throw();  
//A *a= new (p)A(); //它本质上是对operator new的重载，定义于#include <new>中。它不分配内存，调用合适的构造函数在ptr所指的地方构造一个对象，之后返回实参指针ptr。new (p)A()调用placement new之后，还会在p上调用`A::A();a->~A();`一旦这个对象使用完毕,必须显式的调用类的析构函数进行销毁对象。但此时内存空间不会被释放，以便其他的对象的构造  
void* operator new (std::size_t size, void* ptr) throw();
```

对于placement operator new []，必须申请比原始对象大小多出sizeof(int)个字节来存放对象的个数:
```C++
// Original code: Fred* p = new Fred[n];
char* tmp = (char*) operator new[] (WORDSIZE + n * sizeof(Fred));
Fred* p = (Fred*) (tmp + WORDSIZE);
*(size_t*)tmp = n;
size_t i;
try {
  for (i = 0; i < n; ++i)
    new(p + i) Fred();           // Placement new
}
catch (...) {
  while (i-- != 0)
    (p + i)->~Fred();            // Explicit call to the destructor
  operator delete[] ((char*)p - WORDSIZE);
  throw;
}
//Then the delete[] p statement becomes:
// Original code: delete[] p;
size_t n = * (size_t*) ((char*)p - WORDSIZE);
while (n-- != 0)
  (p + n)->~Fred();
operator delete[] ((char*)p - WORDSIZE);

```

## 实现一个Object Pool
[object pool](https://github.com/BestUO/littletools/blob/master/tools/objectpool.hpp)核心逻辑：每个线程都有自己的线程变量static inline thread_local LocalPool* __local_pool_ptr。线程本身有可用内存时直接获取不需要加锁。当本地内存不够时从全局内存池获取需要加锁，或者本地内存满了放到全局内存时需要加锁。v2版本实测多线程场景下性能是new/delete的3倍左右,代码还是不够优雅，有时间再时间一个v4版本。当然这个object pool只能用于内存分配和释放频繁且对象大小固定的场景，最好最全的还是直接使用tcmalloc等高性能内存分配器。
```C++
//测试代码
TEST_CASE("ObjectPool_two_thread_perf")
{
    struct ObjectPoolTest
    {
        int a            = 2;
        std::string b    = "c";
        bool c           = true;
        ObjectPoolTest() = default;
        ObjectPoolTest(int a, std::string b, bool c)
            : a(a)
            , b(b)
            , c(c){};
    };
    int totalnum      = 10000000;
    int runningnum    = 2000;
    uint32_t epochnum = 10;

    auto v2op = v2::ObjectPool<ObjectPoolTest>::GetInstance();
    v2op->GetObject(1, "sss", false);
    ankerl::nanobench::Bench().epochs(1).run(
        "two thread 1000w objectpool v2", [&totalnum, &runningnum, v2op]() {
            std::thread t1([&totalnum, &runningnum, v2op]() {
                ObjectPoolTest* ptr[runningnum];
                int j = 0;
                for (int i = 0; i < totalnum; i++)
                {
                    ptr[j] = v2op->GetObject(1, "sss", false);
                    j++;
                    if (j == runningnum)
                    {
                        for (int k = 0; k < j; k++)
                        {
                            v2op->PutObject(ptr[k]);
                        }
                        j = 0;
                    }
                }
            });
            std::thread t2([&totalnum, &runningnum]() {
                auto v2op = v2::ObjectPool<ObjectPoolTest>::GetInstance();
                v2op->GetObject(1, "sss", false);
                ObjectPoolTest* ptr[runningnum];
                int j = 0;
                for (int i = 0; i < totalnum; i++)
                {
                    ptr[j] = v2op->GetObject(1, "sss", false);
                    j++;
                    if (j == runningnum)
                    {
                        for (int k = 0; k < j; k++)
                        {
                            v2op->PutObject(ptr[k]);
                        }
                        j = 0;
                    }
                }
            });
            t1.join();
            t2.join();
        });
    ankerl::nanobench::Bench().epochs(1).run(
        "two thread 1000w new delete", [&totalnum, &runningnum]() {
            std::thread t1([&totalnum, &runningnum]() {
                ObjectPoolTest* ptr[runningnum];
                int j = 0;
                for (int i = 0; i < totalnum; i++)
                {
                    ptr[j] = new ObjectPoolTest(1, "sss", false);
                    j++;
                    if (j == runningnum)
                    {
                        for (int k = 0; k < j; k++)
                        {
                            delete ptr[k];
                        }
                        j = 0;
                    }
                }
            });
            std::thread t2([&totalnum, &runningnum]() {
                ObjectPoolTest* ptr[runningnum];
                int j = 0;
                for (int i = 0; i < totalnum; i++)
                {
                    ptr[j] = new ObjectPoolTest(1, "sss", false);
                    j++;
                    if (j == runningnum)
                    {
                        for (int k = 0; k < j; k++)
                        {
                            delete ptr[k];
                        }
                        j = 0;
                    }
                }
            });
            t1.join();
            t2.join();
        });
}
```

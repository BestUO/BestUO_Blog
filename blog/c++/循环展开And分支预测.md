# 循环展开&分支预测

## 循环展开

一个神奇的技巧，以下代码仅仅计算1+2+3+.....+10000的值。不同的写法性能差距最高3倍以上，不同的优化命令性能差距也在百倍以上

使用g++ -std=c++11 -o test.out test.cpp编译：
testfunrollloop1共耗时：2.188e-05s
testfunrollloop2共耗时：2.8111e-05s
testfunrollloop2共耗时：1.3043e-05s
使用g++ -std=c++11 -O1 -o test.out test.cpp编译：
testfunrollloop1共耗时：2.668e-06s
testfunrollloop2共耗时：1.326e-06s
testfunrollloop2共耗时：1.368e-06s

使用g++ -std=c++11 -O2 -o test.out test.cpp编译：<br />testfunrollloop1共耗时：7.3e-08s
testfunrollloop2共耗时：3.1e-08s
testfunrollloop2共耗时：2.1e-08s

```C++
void testfunrollloop1()
{
    auto start = std::chrono::system_clock::now();
    int sum = 0;
    int count = 10000;
    //循环10000次累加
    for(int i = 0;i < count;i++){  
        sum += i;
    }
    auto end = std::chrono::system_clock::now();
    std::chrono::duration<double> dura = end - start;
    std::cout <<"testfunrollloop1共耗时："<< dura.count() << "s" << std::endl;
}

void testfunrollloop2()
{
    auto start = std::chrono::system_clock::now();
    int sum = 0;
    int count = 10000;
    //循环10000次累加
    for(int i = 0;i < count;i += 2){
        sum += i;
        sum += i+1;
    }
    auto end = std::chrono::system_clock::now();
    std::chrono::duration<double> dura = end - start;
    std::cout <<"testfunrollloop2共耗时："<< dura.count() << "s" << std::endl;
}

void testfunrollloop3()
{
    auto start = std::chrono::system_clock::now();
    int sum=0, sum1=0, sum2=0;
    int count = 10000;
    //循环10000次累加
    for(int i = 0;i < count;i += 2){
        sum1 += i;
        sum2 += i+1;
    }
    sum = sum1 + sum2;
    auto end = std::chrono::system_clock::now();
    std::chrono::duration<double> dura = end - start;
    std::cout <<"testfunrollloop2共耗时："<< dura.count() << "s" << std::endl;
}

void testtfunrollloop()
{
    testfunrollloop1();
    testfunrollloop2();
    testfunrollloop3();
}
```


## 分支预测

cpu通过流水线架构顺序执行命令提高运行效率，而一旦遇到分支跳转指令，下条指令地址必须由当前指令的执行结果确定，破坏流水线架构降低效率。分支预测的意义就在于解决此类问题。原文地址：[https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array](https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array)

```C++
void batchpredict1(bool usesort)
{
    const unsigned arraySize = 32768;
    int data[arraySize];

    for (unsigned c = 0; c < arraySize; ++c)
        data[c] = std::rand() % 256;

    if(usesort)
        std::sort(data, data + arraySize);

    // Test
    clock_t start = clock();
    long long sum = 0;
    for (unsigned i = 0; i < 100000; ++i)
    {
        for (unsigned c = 0; c < arraySize; ++c)
        {   // Primary loop
            if (data[c] >= 128)
                sum += data[c];
        }
    }

    double elapsedTime = static_cast<double>(clock()-start) / CLOCKS_PER_SEC;

    std::cout << elapsedTime << '\n';
    std::cout << "sum = " << sum << '\n';
}

batchpredict1(false);//24.6022,sum = 314931600000  无sort
batchpredict1(true);//7.85559,sum = 314635000000   有sort

```


debug运行上述代码，性能相差3倍。产生这种结果的原因是CPU自己的分支预测器在产生作用。既然分支跳转指令破坏了流水线结构导致性能降低，是否有方法避免呢？答案是肯定的。此处可以分支跳转代码段：

```C++
 if (data[c] >= 128)
                sum += data[c];
```


改为如下形式：

```C++
int t = (data[c] - 128) >> 31;
sum += ~t & data[c];
```


相当于用算数方法替换了if分支跳转，保证流水线结构执行命令。最终的运行结果用时8.36378秒，已经接近先sort排序用时了。需要注意上述所说情况都在debug模式下运行，在O2编译优化下编译器已经做了优化处理，3种方法的性能相差不大。

### likely/unlikely

在c++20以前likely/unlikely定义为：

```C++
#define likely(x)  __builtin_expect(!!(x), 1)   
#define unlikely(x)  __builtin_expect(!!(x), 0)

```


作用是告知编译器哪种情况更容易/更不容易发生，从而调整分支代码在汇编指令中的位置，使更容易发生的代码块接近当前运行的代码块。[http://t.zoukankan.com/taiyang-li-p-14542113.html](http://t.zoukankan.com/taiyang-li-p-14542113.html)例如：

```C++
if (argc > 0)
    puts ("Positive");
else
    puts ("Zero or Negative");
.LC0:
        .string "Positive"
.LC1:
        .string "Zero or Negative"
main:
        sub     rsp, 8
        test    edi, edi                
        jle     .L2  //如果argc <= 0, 跳转到L2
        mov     edi, OFFSET FLAT:.LC0   //如果argc > 0, 从这里执行
        call    puts
.L3:
        xor     eax, eax
        add     rsp, 8
        ret
.L2:
        mov     edi, OFFSET FLAT:.LC1
        call    puts
        jmp     .L3
```


```C++
if (unlikely（argc > 0）)
    puts ("Positive");
else
    puts ("Zero or Negative");
.LC0:
        .string "Positive"
.LC1:
        .string "Zero or Negative"
main:
        sub     rsp, 8
        test    edi, edi
        jg      .L6
        mov     edi, OFFSET FLAT:.LC1
        call    puts
.L3:
        xor     eax, eax
        add     rsp, 8
        ret
.L6:
        mov     edi, OFFSET FLAT:.LC0
        call    puts
        jmp     .L3
```


c++20添加了[[likely]]和[[unlikely]]新属性，功能和以前的相似[https://en.cppreference.com/w/cpp/language/attributes/likely](https://en.cppreference.com/w/cpp/language/attributes/likely)

```C++
int f(int i)
{
    switch(i)
    {
        case 1: [[fallthrough]];
        [[likely]] case 2: return 1;
    }
    return 2;
}
i == 2 is considered more likely than any other value of i, but the [[likely]] has no effect on the i == 1 case even though it falls through the case 2: label.
```




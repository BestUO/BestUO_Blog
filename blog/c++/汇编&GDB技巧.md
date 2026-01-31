# 汇编&GDB日常使用
其他实用技巧遇到后补充
## 寄存器
- eax(32位)/rax(64位):通常用来执行加法，函数调用的返回值一般也放在这里面
- ebx(32位)/rbx:通常用来数据存取
- ecx(32位)/rcx:通常用作for循环的计数器
- edx(32位)/rdx(64位):读取I/O端口时，存放端口号
- esp(32位)/rsp(64位):栈顶指针，指向栈的顶部
- ebp(32位)/rbp(64位):栈底指针，指向栈的底部，用ebp+偏移量的形式来定位函数存放在栈中的局部变量
- esi(32位)/rsi(64位):字符串操作时，用于存放数据源的地址
- edi(32位)/rdi(64位):字符串操作时，用于存放目的地址的，和esi两个经常搭配一起使用，执行字符串的复制等操作
- eip/rip 程序计数寄存器
### 打印寄存器的值
```
-exec p $esi
$1 = -1138132808

-exec info register
rax            0x404345            4211525
rbx            0x0                 0
rcx            0x100               256
rdx            0x7ffdbc2978c8      140727760287944
rsi            0x7ffdbc2978b8      140727760287928
rdi            0x1                 1
rbp            0x7ffdbc2977c0      0x7ffdbc2977c0
rsp            0x7ffdbc2977a0      0x7ffdbc2977a0
r8             0x0                 0
r9             0x7f26bc1aae78      139804341350008
r10            0xfffffffffffff7cc  -2100
r11            0x7f26bbcac9f0      139804336114160
r12            0x4021f0            4202992
r13            0x0                 0
r14            0x0                 0
r15            0x0                 0
rip            0x404370            0x404370 <main()+43>
eflags         0x206               [ PF IF ]
cs             0x33                51
ss             0x2b                43
ds             0x0                 0
es             0x0                 0
fs             0x0                 0
gs             0x0                 0
```
### 函数调用call指令
```
push %rbp //rbp压栈，被调函数返回时执行pop %rbp，正好是调用函数的rbp值。
mv %rsp,%rbp//将调用函数的rsp值赋给rbp，相当于调用方的栈顶成为被调方的栈底。
```
### 打印rpb值
栈是向下生长的，所以打印rbp需要偏移
```
int a=3;		movel $0x3,-0x18(%rbp)
int b=1;		movel $0x1,-0x1c(%rbp)
int c=1;		movel $0x1,-0x20(%rbp)
int d=1;		movel $0x1,-0x24(%rbp)
int e=1;		movel $0x1,-0x28(%rbp)
-exec x /5uw $rbp-0x28
0x7ffebefd5e08:	0	1	1	1
0x7ffebefd5e18:	3
```
### x命令
使用"x"命令来打印内存的值，格式为"x /nfu addr"。含义为以f格式打印从addr开始的n个长度单元为u的内存值。参数具体含义如下：

- n：输出单元的个数。
- f：是输出格式。比如x是以16进制形式输出，o是以8进制形式输出,u是以10进制形式输出,t是以2进制形式输出。
- u：标明一个单元的长度。b是一个byte，h是两个byte（halfword），w是四个byte（word），g是八个byte（giant word）。
```
int aa[2]={1,2};
-exec x /2uw aa
0x7ffdba3760c0:	1	2
```
### print命令
```
print [Expression]
print $[Previous value number]
print {[Type]}[Address]
print [First element]@[Element count]
print /[Format] [Expression]

Format格局：
o - 8进制
x - 16进制
u - 无符号十进制
t - 二进制
f - 浮点数
a - 地址
c - 字符
s - 字符串

-exec p *argv@argc
int aa[2]={1,2};
-exec p *aa@2
$8 = {1, 2}
```
### 汇编中的[]
```mov ax,[bx]```。[]相当于指针。bx和[bx]的区别是，前者操作数就是bx中存放的数，后者操作数是以bx中存放的数为地址的单元中的数。比如bx中存放的数是40F6H，40F6H、40F7H两个单元中存放的数是22H、23H。特别注意的是lea:load effect address 装载有效地址值操作。lea的操作数就是地址
```
mov ax,[bx]；2223H传送到ax中
mov ax,bx；40F6H传送到ax中
lea eax,[edx-02] //把 edx 中的值减去2再送入eax, 而不是把由[edx-02]指明的内存地址上的值放到eax
lea eax,[1122H]:直接将地址值1122H赋值给eax等价mov eax,1122H
```
### 编译优化问题导致core文件行数和实际代码不对齐
```
-exec x /i $rip
=> 0x4054be <main()+139>:	movl   $0x0,-0x14(%rbp)
addr2line -e study 0x4054be
```
### 函数调用栈里面会出现很多？？的情况
```
-exec x /2ag $rbp
0x7ffdff5e8270:	0x7ffdff5e82c0	0x4054dc <_Z11add_a_and_biiiii+169>
-exec x /2ag 0x7ffdff5e82c0
0x7ffdff5e82c0:	0x7ffdff5e8330	0x40556b <main()+91>
```
### gdb 打开汇编
```
layout split
layout asm
```
### 查看被优化变量
找到参数压栈汇编：```mov $0x402011, %edi```，这里的0x402011即为str的内存地址，通过x命令```x /10cb 0x402011```显示str的值了。

### 踩内存定位
获取内存地址，可以通过```info args```或者打印寄存器值获取,之后gdb watch该内存地址
```
void MM(Test *t)
{
    t->aaa = 100;
}
info args
t = 0x1683fb0
p /x $rdi
$4 = 0x1683fb0
```
或者通过[asan](https://www.jianshu.com/p/4c07586f8694)定位

## 参考
- [汇编语言入门教程](http://www.ruanyifeng.com/blog/2018/01/assembly-language-primer.html)
- [如何快速定位程序Core](https://baijiahao.baidu.com/s?id=1716837267417880631&wfr=spider&for=pc)
- [打印STL容器中的内容](https://wizardforcel.gitbooks.io/100-gdb-tips/content/print-STL-container.html)
- [踩内存定位](https://www.cnblogs.com/xingmuxin/p/11287935.html)
- [如何利用硬件watchpoint定位踩内存问题](http://blog.coderhuo.tech/2019/07/21/arm_hardware_breakpoint/)
- [踩内存问题分析工具](https://blog.csdn.net/xuhaitao23/article/details/125430324)
- [asan](https://www.jianshu.com/p/4c07586f8694)
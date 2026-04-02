[TOC]
# 汇编 & GDB 日常使用手册
AT&T 语法：  lea  src, dst       源 → 目标
Intel 语法： lea  dst, src       目标 ← 源
```
(gdb) show disassembly-flavor
The disassembly flavor is "att".
```

## 1. 寄存器速查

### 通用寄存器（64位）

| 64位 | 32位 | 16位 | 8位 | 职责 / 说明 |
|------|------|------|-----|------------|
| rax | eax | ax | al | 函数**返回值**；算术运算结果 |
| rbx | ebx | bx | bl | 被调用者保存（callee-saved），跨调用保持 |
| rcx | ecx | cx | cl | 第 **4** 个参数；循环计数器 |
| rdx | edx | dx | dl | 第 **3** 个参数；I/O 端口号；128位乘除的高位 |
| rsi | esi | si | sil | 第 **2** 个参数；字符串源地址 |
| rdi | edi | di | dil | 第 **1** 个参数（C++ 成员函数的隐式 `this`）；字符串目的地址 |
| rsp | esp | sp | spl | **栈顶指针**，始终指向栈顶，栈向低地址增长 |
| rbp | ebp | bp | bpl | **栈帧基址**；`rbp + 负偏移` = 局部变量（-O2 后常被省略） |
| r8–r9 | r8d–r9d | r8w–r9w | r8b–r9b | 第 **5、6** 个参数 |
| r10–r11 | — | — | — | 调用者临时使用，跨调用不保证 |
| r12–r15 | — | — | — | 被调用者保存，跨调用保持 |
| rip | eip | — | — | **指令指针**，指向下一条将执行的指令；崩溃地址就在这里 |
| rflags | eflags | — | — | 标志位：ZF(零)、CF(进位)、SF(符号)、OF(溢出) |

**子寄存器关系（以 rax 为例）：**
```
┌────────────────────────────────────────────────────────────┐
│                         rax (64bit)                        │
│                    ┌───────────────────┐                   │
│                    │    eax (32bit)    │                   │
│                    │       ┌───────┐  │                   │
│                    │       │ax(16) │  │                   │
│                    │       │ah │al │  │                   │
│                    │       └───────┘  │                   │
│                    └───────────────────┘                   │
└────────────────────────────────────────────────────────────┘
```
> 向 eax 写入时，rax 高32位自动清零（x86-64 规定）。向 ax/al 写入时，高位保持不变。

### 打印寄存器

```gdb
(gdb) info registers            -- 打印所有通用寄存器（十进制 + 十六进制）
(gdb) info registers rdi rsi    -- 只打印指定寄存器
(gdb) p/x $rdi                  -- 以十六进制打印 rdi 的值
(gdb) p/d $rax                  -- 以十进制打印
(gdb) p/t $rflags               -- 以二进制打印标志位
```

---

## 2. x86-64 调用约定（System V ABI）

Linux / macOS 上 C/C++ 编译器统一遵循此规范。

### 参数传递顺序

```
整数 / 指针参数：rdi → rsi → rdx → rcx → r8 → r9 → 栈（从右往左）
浮点参数：       xmm0 → xmm1 → ... → xmm7 → 栈
返回值：         整数/指针 → rax（64位）或 rdx:rax（128位）
                 浮点       → xmm0
```

### C++ 成员函数的隐式 this

```cpp
// C++ 代码
obj.GetMapList(json_param);

// 汇编层等价于：
// rdi = &obj          ← this（隐式第1参数）
// rsi = &json_param   ← 第1个显式参数
// call GetMapList
```

### 寄存器保存约定

| 类型 | 寄存器 | 说明 |
|------|--------|------|
| 调用者保存（caller-saved） | rax, rcx, rdx, rsi, rdi, r8–r11 | 调用子函数后可能被覆盖，调用方负责在调用前保存 |
| 被调用者保存（callee-saved） | rbx, rbp, r12–r15 | 子函数若使用这些寄存器，必须在返回前恢复原值 |

> **调试意义**：崩溃时 rdi/rsi 里的参数值，如果崩溃点离函数入口较远，可能已被编译器复用。应结合 `disassemble` 查看是否有 `mov rbx, rdi` 这类保存操作，从 rbx 读取更可靠的 this。

### 超过6个参数时

```
调用前栈布局（从高地址到低地址）：
  [rsp+16]  第8个参数
  [rsp+8]   第7个参数
  [rsp]     返回地址（call 指令压入）
```

---

## 3. 栈帧结构

### 函数调用时的完整流程

```asm
; ① 调用方执行 call 指令
call GetMapList
; call = push rip（返回地址）+ jmp 目标地址

; ② 被调函数序言（prologue）——有帧指针时
push rbp            ; 保存调用方的 rbp
mov  rbp, rsp       ; 以当前 rsp 作为本帧基址
sub  rsp, 0x40      ; 为局部变量分配空间

; ③ 被调函数尾声（epilogue）
mov  rsp, rbp       ; 恢复 rsp
pop  rbp            ; 恢复调用方的 rbp
ret                 ; pop rip，跳回调用方
```

### 栈内存布局（有帧指针 rbp 时）

```
高地址
┌──────────────────────────────┐
│    调用方的局部变量 ...       │
├──────────────────────────────┤  ← 调用方的 rsp（调用前）
│    第7+参数（如有）           │
├──────────────────────────────┤
│    返回地址（call 压入）      │  rbp + 8
├──────────────────────────────┤
│    saved rbp（调用方的 rbp） │  ← rbp 指向这里
├──────────────────────────────┤
│    本函数局部变量 #1          │  rbp - 8
│    本函数局部变量 #2          │  rbp - 16
│    ...                       │
├──────────────────────────────┤  ← rsp（栈顶）
低地址
```

### -O2 省略帧指针（常见）

```asm
; 省略 rbp 后，直接用 rsp + 偏移寻址局部变量
sub  rsp, 0x28
mov  DWORD PTR [rsp+0x4], edi    ; 局部变量 #1
mov  QWORD PTR [rsp+0x8], rsi    ; 局部变量 #2
```

> 此时 `rbp` 不再是帧基址，用 `x/N xg $rsp` 查看栈内容，结合 `disassemble` 中的偏移手动还原变量。

### 查看局部变量（有 rbp 时）

```cpp
// C++ 代码
int a = 3;   // movel $0x3, -0x18(%rbp)
int b = 1;   // movel $0x1, -0x1c(%rbp)
int c = 1;   // movel $0x1, -0x20(%rbp)
```

```gdb
(gdb) x/5dw $rbp-0x20    -- 从 rbp-0x20 开始，读5个4字节，十进制显示
```

### 查看局部变量（-O2 省略 rbp，用 rsp）

```gdb
(gdb) x/16xg $rsp         -- 打印栈上16个8字节槽（十六进制）
(gdb) x/8xw $rsp          -- 打印32字节，适合看32位局部变量
```

---

## 4. 汇编指令速查

### 数据传送

| 指令 | 含义 | C++ 等价 |
|------|------|---------|
| `mov rax, rbx` | rax = rbx | rax = rbx |
| `mov rax, [rbx]` | rax = *rbx | rax = *(uint64_t*)rbx |
| `mov rax, [rbx+8]` | 访问结构体偏移8字节处 | rax = obj->field2 |
| `mov [rax], rbx` | *rax = rbx | *(uint64_t*)rax = rbx |
| `lea rax, [rbx+8]` | rax = rbx+8（取地址，不解引用） | rax = &obj->field2 |
| `movzx rax, BYTE PTR [rbx]` | 零扩展读1字节 | rax = (uint8_t)*rbx |
| `movsx rax, DWORD PTR [rbx]` | 符号扩展读4字节 | rax = (int32_t)*rbx |
| `xchg rax, rbx` | 交换两寄存器 | swap(rax, rbx) |

> **`mov` vs `lea` 的关键区别**：`mov rax, [rbx+8]` 去内存取值；`lea rax, [rbx+8]` 只计算地址，不访问内存。

### 算术 & 逻辑

| 指令 | 含义 |
|------|------|
| `add rax, rbx` | rax += rbx |
| `sub rax, rbx` | rax -= rbx |
| `imul rax, rbx` | rax *= rbx（有符号） |
| `inc rax` | rax++ |
| `dec rax` | rax-- |
| `neg rax` | rax = -rax |
| `and/or/xor/not` | 位运算 |
| `shl rax, 2` | rax <<= 2（乘以4） |
| `shr rax, 3` | rax >>= 3（无符号右移） |
| `sar rax, 3` | 算术右移（保符号位） |

### 比较 & 跳转

```asm
cmp rax, rbx    ; 计算 rax-rbx，结果只影响 rflags，不改变寄存器
test rax, rax   ; 计算 rax & rax，常见用法：检查 rax 是否为 0（比 cmp rax,0 短）

; 常见条件跳转
je  label   ; jump if equal (ZF=1)
jne label   ; jump if not equal (ZF=0)
jz  label   ; jump if zero（等价 je）
jnz label   ; jump if not zero（等价 jne）
jg  label   ; jump if greater (signed)
jl  label   ; jump if less (signed)
ja  label   ; jump if above (unsigned)
jb  label   ; jump if below (unsigned)
js  label   ; jump if sign (SF=1，结果为负)
```

### 函数调用 & 返回

```asm
call 0x12345    ; push rip; jmp 0x12345
call [rax]      ; 调用 rax 指向的函数（虚函数调用常见形式）
call [rax+0x18] ; 调用 vtable 偏移 0x18 处的虚函数
ret             ; pop rip（从栈弹出返回地址，跳回）
```

### [] 解引用详解

```asm
mov ax, bx          ; ax = bx（寄存器值，40F6H）
mov ax, [bx]        ; ax = *(bx)（bx 所指内存的内容，2223H）
mov ax, [bx+4]      ; ax = *(bx+4)（结构体字段）
lea eax, [edx-2]    ; eax = edx-2（仅计算地址，不解引用）
lea eax, [1122H]    ; eax = 0x1122（等价 mov eax, 0x1122）
```

---

## 5. GDB 常用命令

### 启动与加载

```gdb
gdb ./your_binary core          -- 直接加载 core 文件
gdb ./your_binary               -- 启动后 run 运行
(gdb) file /path/to/binary      -- 加载符号文件
(gdb) symbol-file ./debug.sym   -- 加载分离的调试符号
(gdb) core-file ./core.1234     -- 加载 core 文件
```

### 打印命令 `p`（print）

```gdb
(gdb) p $rdi                    -- 打印寄存器（十进制）
(gdb) p/x $rdi                  -- 十六进制
(gdb) p/d $rax                  -- 有符号十进制
(gdb) p/u $rax                  -- 无符号十进制
(gdb) p/t $rflags               -- 二进制
(gdb) p/f $xmm0                 -- 浮点数
(gdb) p/c $al                   -- 字符
(gdb) p/s $rsi                  -- 字符串（rsi 必须指向有效字符串）
(gdb) p *argv@argc              -- 打印数组（@N 表示前 N 个元素）
(gdb) p {int}0x7fff1234         -- 把地址强转成类型打印
(gdb) p sizeof(nlohmann::json)  -- 打印类型大小（需要符号）
```

### 内存检查命令 `x`（examine）

格式：`x /NFS addr`，N=数量，F=格式，S=单元大小

```gdb
(gdb) x/4xg $rdi       -- 打印 rdi 指向的4个 uint64（十六进制），看对象头部/vtable
(gdb) x/8xw $rsp       -- 打印栈顶8个 uint32
(gdb) x/32xb $rsi      -- 打印32个字节，看原始内存
(gdb) x/s  $rsi        -- 把地址当 C 字符串打印（遇 \0 停止）
(gdb) x/4dw $rbp-0x20  -- 十进制打印4个32位局部变量
(gdb) x/i  $rip        -- 打印当前指令（反汇编单条）
(gdb) x/10i $rip-20    -- 打印 rip 前后共10条指令
```

| 格式(F) | 含义 | 单元(S) | 大小 |
|---------|------|---------|------|
| x | 十六进制 | b | 1 字节 |
| d | 有符号十进制 | h | 2 字节（halfword）|
| u | 无符号十进制 | w | 4 字节（word）|
| o | 八进制 | g | 8 字节（giant）|
| t | 二进制 | | |
| f | 浮点数 | | |
| s | 字符串 | | |
| i | 反汇编指令 | | |
| a | 地址 | | |

### 反汇编

```gdb
(gdb) disassemble                      -- 反汇编当前函数（自动标出崩溃位置 =>）
(gdb) disassemble /m                   -- 混合显示源码和汇编（需要调试符号）
(gdb) disassemble /r                   -- 同时显示原始机器码字节
(gdb) disassemble $pc-32, $pc+16      -- 以 pc 为中心反汇编一段范围
(gdb) disassemble 0x5635d22b5a00      -- 反汇编指定地址所在函数
```

> **实用技巧**：直接 `disassemble` 最省事，gdb 会用 `=>` 标出崩溃行，不需要手算偏移。

### 调用栈 & 帧切换

```gdb
(gdb) bt                  -- 打印调用栈（backtrace）
(gdb) bt full             -- 打印调用栈 + 每帧的局部变量
(gdb) bt 10               -- 只显示最近10帧
(gdb) frame 0             -- 切换到第0帧（崩溃帧）
(gdb) frame 1             -- 切换到调用方
(gdb) up / down           -- 在帧之间上下移动
(gdb) info frame          -- 打印当前帧详情（rip、rsp、rbp 等）
(gdb) info args           -- 打印当前帧的函数参数
(gdb) info locals         -- 打印当前帧的局部变量（需要调试符号）
```

### 搜索内存

```gdb
-- 在栈内搜索字符串（定位 json key 是否还在内存）
(gdb) find $rsp, $rsp+4096, "map_list"

-- 搜索特定字节值（如搜索 0xdeadbeef）
(gdb) find /w 0x600000, 0x700000, 0xdeadbeef

-- 搜索地址值
(gdb) find /g $rsp, $rsp+0x1000, 0x5635d22b5a5d
```

### 断点 & 观察点

```gdb
(gdb) break main          -- 在 main 处断点
(gdb) break *0x12345678   -- 在指定地址断点（无符号时用）
(gdb) watch *0x1683fb0    -- 当该地址内存被写时中断（踩内存利器）
(gdb) rwatch *0x1683fb0   -- 读时中断
(gdb) awatch *0x1683fb0   -- 读写都中断
(gdb) info watchpoints    -- 列出所有观察点
(gdb) delete 1            -- 删除编号1的断点/观察点
```

### 汇编视图

```gdb
(gdb) layout asm          -- 打开汇编窗口（TUI 模式）
(gdb) layout split        -- 分屏显示源码 + 汇编
(gdb) layout regs         -- 显示寄存器面板
(gdb) tui disable         -- 退出 TUI 模式
```

### 其他实用命令

```gdb
(gdb) info threads        -- 查看所有线程
(gdb) thread 3            -- 切换到线程3
(gdb) set print pretty on -- 美化 STL 容器打印
(gdb) set pagination off  -- 关闭分页（批量输出时有用）
(gdb) show follow-fork-mode     -- 查看 fork 后跟踪哪个进程
```

---

## 6. Release 版本 core 文件分析

Release 版本因 `-O2/-O3` 优化和 `strip` 导致调试信息丢失，但仍有几种方法还原入参和局部变量。

### 方法一：有符号但未 strip 的二进制

```bash
# 编译时保留调试信息，同时开启优化
CXXFLAGS="-O2 -g -fno-omit-frame-pointer" cmake ..

# 生产环境推荐：分离调试符号
objcopy --only-keep-debug your_binary your_binary.debug
strip --strip-debug your_binary
objcopy --add-gnu-debuglink=your_binary.debug your_binary
```

```gdb
(gdb) symbol-file your_binary.debug
(gdb) core-file core.1234
(gdb) bt full                          -- 此时有完整局部变量
(gdb) info locals
(gdb) info args
```

### 方法二：从寄存器还原入参（无符号时）

```gdb
(gdb) frame 0
(gdb) info registers                   -- 看所有寄存器快照

-- 检查 this 指针（成员函数第1参数）
(gdb) p/x $rdi
(gdb) x/4xg $rdi                       -- 解引用，看 vtable 是否合法

-- 检查第1个显式参数（如 json 引用）
(gdb) p/x $rsi
(gdb) x/8xg $rsi                       -- 解引用，看 json 对象内部结构

-- 如果 rdi/rsi 已被覆盖，找 callee-saved 寄存器
-- 编译器常用 mov rbx, rdi 保存 this
(gdb) p/x $rbx
(gdb) x/4xg $rbx
```

### 方法三：读取汇编还原变量

```gdb
(gdb) disassemble                      -- 查看崩溃函数全部汇编

-- 示例：在汇编中发现 mov QWORD PTR [rsp+0x10], rsi
-- 说明 json 参数被保存到了栈上 rsp+0x10
(gdb) x/1xg $rsp+0x10                 -- 从栈上读回参数值
```

### 方法四：代码行与地址不对齐时

```gdb
-- 用 rip 精确定位当前指令
(gdb) x/i $rip

-- 用 addr2line 查源码行（需要 -g 编译）
addr2line -e your_binary 0x5635d22b5a5d -f -C
```

### 判断崩溃根因：常见内存错误特征

| 现象 | 可能原因 |
|------|---------|
| `rsi = 0x0` | 空指针解引用，传了 NULL 引用/指针 |
| `x/4xg $rdi` 报 `Cannot access memory` | this 指针已失效（对象被析构，use-after-free） |
| 内存内容全 `0xdddddddd` 或 `0xfeeefeee` | MSVC/某些分配器的填充值，已被释放 |
| 内存内容全 `0xbebebebe` | 未初始化堆内存（特定调试分配器） |
| vtable 指针指向非法地址 | 对象内存被踩（corruption） |
| 崩溃在 `call [rax+N]`，rax=0 | 虚函数调用，对象指针为空或 vtable 被覆盖 |

---

## 7. 踩内存定位

### 方式一：GDB watch（硬件断点，精确）

```gdb
-- 先获取被踩内存的地址
(gdb) info args
(gdb) p/x $rdi           -- 或通过 info args 获取对象地址

-- 设置硬件观察点（当该地址被写时自动中断）
(gdb) watch *(long*)0x1683fb0
(gdb) watch -l myVar     -- 监视局部变量（需要符号）
(gdb) run
-- 触发后 gdb 会显示是哪条指令修改了内存，以及修改前后的值
```

> 硬件观察点数量有限（通常4个），超出会自动降级为软件观察点（性能差很多）。

### 方式二：AddressSanitizer（ASan）

```bash
# 编译时开启
CXXFLAGS="-fsanitize=address -g -fno-omit-frame-pointer" cmake ..

# 运行时自动检测并报告
./your_binary
# 输出：heap-use-after-free / heap-buffer-overflow / stack-buffer-overflow 等
```

ASan 开销约 2倍内存、1.5–2倍 CPU，适合 CI 环境或专项测试，不适合生产。

### 方式三：Valgrind

```bash
valgrind --tool=memcheck --leak-check=full --track-origins=yes ./your_binary
```

开销较大（5–20倍），但无需重新编译，适合已有二进制的场景。

---

## 8. 编译选项建议

### 推荐的 CMake 配置

```cmake
# 生产环境推荐：优化 + 保留调试符号
set(CMAKE_BUILD_TYPE RelWithDebInfo)
# 等价于：-O2 -g -DNDEBUG

# 额外推荐选项（性能损失 < 1%，调试体验大幅提升）
target_compile_options(your_target PRIVATE
    -fno-omit-frame-pointer   # 保留帧指针，栈回溯更准确
    -fno-optimize-sibling-calls  # 禁止尾调用优化，保留完整调用链
)
```

### 分离调试符号（生产标准做法）

```bash
# 编译带符号的二进制
g++ -O2 -g -fno-omit-frame-pointer -o your_binary your_src.cpp

# 分离符号到 .debug 文件
objcopy --only-keep-debug your_binary your_binary.debug
strip --strip-debug --strip-unneeded your_binary

# 建立链接（可选，gdb 会自动找 .debug 文件）
objcopy --add-gnu-debuglink=your_binary.debug your_binary

# 部署 your_binary（无符号），保存 your_binary.debug（有符号）
```

### 调试选项对比

| 选项 | 效果 | 推荐场景 |
|------|------|---------|
| `-O0 -g` | 完整调试信息，无优化 | 本地开发 |
| `-O2 -g` | 有优化 + 有调试符号（文件变大） | CI / 预发布 |
| `-O2 -g` + 分离符号 | 部署轻量，调试时加载符号 | **生产推荐** |
| `-O2`（无 -g）| 最小体积，调试困难 | 不推荐 |
| `-O2 -fno-omit-frame-pointer` | 保留帧指针，栈回溯更准确 | 生产推荐附加 |

---

## 9. 参考资料

- [汇编语言入门教程 - 阮一峰](http://www.ruanyifeng.com/blog/2018/01/assembly-language-primer.html)
- [System V AMD64 ABI 规范](https://refspecs.linuxbase.org/elf/x86_64-abi-0.99.pdf)
- [如何快速定位程序 Core](https://baijiahao.baidu.com/s?id=1716837267417880631&wfr=spider&for=pc)
- [打印 STL 容器中的内容](https://wizardforcel.gitbooks.io/100-gdb-tips/content/print-STL-container.html)
- [踩内存定位](https://www.cnblogs.com/xingmuxin/p/11287935.html)
- [如何利用硬件 watchpoint 定位踩内存问题](http://blog.coderhuo.tech/2019/07/21/arm_hardware_breakpoint/)
- [踩内存问题分析工具](https://blog.csdn.net/xuhaitao23/article/details/125430324)
- [AddressSanitizer 使用指南](https://www.jianshu.com/p/4c07586f8694)
- [GDB 官方文档](https://www.sourceware.org/gdb/documentation/)
- [Compiler Explorer（在线查看汇编输出）](https://godbolt.org/)
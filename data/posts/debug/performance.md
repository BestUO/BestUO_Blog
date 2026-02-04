[TOC]

# 性能分析工具
## valgrind
略

## mtrace
略

## pmap
1. `pmap -x pid | sort -k 3 -n | tail -n 20` 查看内存使用最多的20块
2. `cat /proc/pid/smaps` 查看内存块具体开始结束位置
3. `gdb -p pid`
4. `dump binary memory ./mem.bin 0x7fa1d0b57000 0x7FA1D0B70000` 导出内存块
5. `hexdump -Cv mem.bin` 查看内存块内容

## Perf
[介绍1](https://blog.csdn.net/runafterhit/article/details/107801860),[介绍2](https://blog.csdn.net/jasonactions/article/details/109332167)。

### 基本使用
* `perf top -g -p pid`

### 监控指定事件
* `perf top -e cache-misses -g -p pid`
```
Task-clock-msecs：CPU 利用率，该值高，说明程序的多数时间花费在 CPU 计算上而非 IO。
Context-switches：进程切换次数，记录了程序运行过程中发生了多少次进程切换，频繁的进程切换是应该避免的。
Cache-misses：程序运行过程中总体的 cache 利用情况，如果该值过高，说明程序的 cache 利用不好
CPU-migrations：表示进程 t1 运行过程中发生了多少次 CPU 迁移，即被调度器从一个 CPU 转移到另外一个 CPU 上运行。
Cycles：处理器时钟，一条机器指令可能需要多个 cycles，
Instructions: 机器指令数目。
IPC：是 Instructions/Cycles 的比值，该值越大越好，说明程序充分利用了处理器的特性。
Cache-references: cache 命中的次数
Cache-misses: cache 失效的次数。
注：通过指定 -e 选项，您可以改变 perf stat 的缺省事件
```
### 分析锁竞争
1. `perf lock record -p pid -- sleep 10`
2. `perf lock report -i perf.data`
### 记录perf结果并显示
1. `perf record -g -e cpu-clock ./a`
2. `perf record -a -e cycles -o cycle.perf -g -p pid sleep 10 	`
3. `perf report -i cycle.perf | more`
4. `perf report -i cycle.perf > perf.txt`
###  提供被调试程序运行的整体情况和汇总数据	
1. `perf stat -p pid`

### 火焰图
1. `git clone https://github.com/brendangregg/FlameGraph.git`
2. `sudo perf record -g -p $(pidof ttt) -- sleep 10`
3. `sudo perf script > out.perf`
4. `./FlameGraph/stackcollapse-perf.pl out.perf > out.folded`
5. `./FlameGraph/flamegraph.pl out.folded > flamegraph.svg`

### perf统计上下文切换
1. `sudo perf sched record -p $PID$-- sleep 300`
2. `sudo perf sched timehist -p $PID$  -nwV`
3. `sudo perf sched script`

## gperftools
### 安装
1. `sudo apt-get install google-perftools libgoogle-perftools-dev`
2. `sudo apt install graphviz ghostscript`

### 编译选项
直接使用静态库，防止代码层未引用，gcc不链这个动态库。
```
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
   target_link_libraries(${PROJECT_NAME} tcmalloc_and_profiler)
endif()
```

### 内存分析
1. `HEAPPROFILE=server.mem ./server`
2. `google-pprof --pdf ./server server.mem.0001.heap > heap.pdf`

### 性能分析
1. `CPUPROFILE=server.prof ./server`
2. `google-pprof --pdf ./server server.prof > perf.pdf`

### 内存泄漏
1. `HEAPCHECK=normal ./server`

## Asan
### 安装
1. `sudo apt-get install libasan6`

### 编译选项
```
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
   add_compile_options(-g -O0 -fsanitize=address -fno-omit-frame-pointer)
   add_link_options(-fsanitize=address)
endif()
```

### 内存分析
1. `export ASAN_OPTIONS="detect_leaks=1:halt_on_error=0:log_path=/tmp/asan.log"`
2. `./server`
3. 常用 ASAN_OPTIONS 参数

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `detect_leaks` | 1 | 启用内存泄漏检测 |
| `halt_on_error` | 1 | 发现第一个错误时停止 |
| `abort_on_error` | 0 | 出错时调用 abort() |
| `log_path` | stderr | 日志输出路径（可设为文件） |
| `verbosity` | 0 | 详细级别（0-2） |
| `malloc_context_size` | 30 | 调用栈深度 |
| `detect_stack_use_after_return` | 0 | 检测返回后使用栈内存 |
| `check_initialization_order` | 0 | 检测初始化顺序问题 |
| `strict_init_order` | 0 | 严格初始化顺序检查 |
| `detect_invalid_pointer_pairs` | 0 | 检测无效指针操作 |
| `quarantine_size_mb` | 256 | 隔离区大小(MB) |
| `alloc_dealloc_mismatch` | 0 | 检测分配/释放函数不匹配 |
| `symbolize` | 1 | 符号化堆栈跟踪 |
| `strip_path_prefix` | - | 从路径中剥离前缀 |
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
```
# cmaklist中直接打静态库进去
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
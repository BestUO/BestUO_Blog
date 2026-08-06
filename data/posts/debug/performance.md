[TOC]

# 性能分析工具
## cpu性能分析
1. cpu性能策略:         cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
2. 当前cpu频率策略:     cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq
3. 当前cpu频率:         cat /sys/devices/system/cpu/cpu*/cpufreq/cpuinfo_cur_freq
4. 当前cpu温度:         cat /sys/class/thermal/thermal_zone*/temp
5.  绑核
   1. 查看CPU核心数及架构: `lscpu cat`, `/proc/cpuinfo`
   2. 查看进程当前运行在哪个CPU上（输出的是十六进制掩码）: `taskset -p pid`
   3. 绑核: `taskset -c 0-3 -p pid`
6. pidstat
| 参数 | 含义 | 常用组合 | 能解决的关键问题 |
| :--- | :--- | :--- | :--- |
| **`-d`** | **报告 I/O 统计**（disk I/O） | `pidstat -d 1` | 谁在疯狂读写磁盘？ |
| **`-r`** | **报告内存使用和缺页**（page faults & memory） | `pidstat -r 1` | 谁的内存一直在涨（内存泄漏）？是否发生了大量磁盘换页？ |
| **`-u`** | **报告 CPU 使用统计**（CPU）（默认选项） | `pidstat -u 1` | 谁占用了CPU？程序是在用户态还是内核态工作？ |
| **`-w`** | **报告上下文切换**（context switches） | `pidstat -w 1` | 进程是否在进行大量的上下文切换，导致系统开销增大？ |
| **`-p`** | **指定进程/线程 ID**（指定PID） | `pidstat -p 1234 1` | 如何只跟踪某个特定的进程，避免干扰？ |
| **`-C`** | **用命令名过滤**（filter by command） | `pidstat -C "java" 1` | 如何同时监控所有名称包含 "java" 的进程？ |
| **`-t`** | **显示进程下的线程信息**（include threads） | `pidstat -t -p 1234 1` | 如何深入分析多线程程序中哪个具体线程出了问题？ |
| **`-l`** | **显示完整命令名和参数** | `pidstat -l 1` | 如何看到带完整路径和参数的进程启动命令？ |
| **`-h`** | **一行显示所有信息**，不显示平均值等额外统计 | `pidstat -h -d 1` | 如何将 `pidstat` 的输出重定向到方便脚本分析的格式？ |


## 磁盘性能分析
1. iostat -x
2. 列出所有磁盘设备: lsblk
3. 查看磁盘io策略: cat /sys/block/mmcblk0/queue/scheduler
   * mq-deadline: 对读请求有优先级的保障（默认500ms超时），避免请求"饿死"。
   * kyber: 调度器会根据实时性能自动调整，旨在提供稳定的延迟。
   * bfq: 为每个进程分配公平的I/O带宽预算，保证桌面交互流畅性。
4. 查看磁盘io性能: `sudo iotop -o -p pid` 监控指定进程的磁盘io性能，`-o`选项只显示有io操作的进程，`-p`选项指定监控的进程pid。
5. pidstat -d 1 -p pid 监控指定进程的磁盘io性能，`-d`选项显示磁盘io统计信息，`1`表示每秒刷新一次数据，`-p`选项指定监控的进程pid。

### iostat -x 使用示例
```
iostat -x 1
```
每秒刷新一次，显示所有磁盘的扩展统计信息。关键字段：

| 字段 | 含义 |
| :--- | :--- |
| `%util` | 该磁盘设备的繁忙程度（接近100%说明磁盘是瓶颈） |
| `r/s` `w/s` | 每秒读/写请求数（IOPS） |
| `rkB/s` `wkB/s` | 每秒读/写的数据量 |
| `await` | IO请求的平均等待时间（ms），包括排队+处理时间 |
| `r_await` `w_await` | 分别是读、写请求的平均等待时间 |
| `avgqu-sz` | 平均IO队列长度，越大说明请求堆积越严重 |
| `svctm` | 平均每次IO请求的服务时间（较老版本才有，新版建议看await） |

常用组合：
```
iostat -x 1 5             # 每秒刷新，共采样5次
iostat -x -d mmcblk0 1    # 只看指定设备
```
判断磁盘瓶颈：`%util` 持续接近100% 且 `await` 明显偏高，说明磁盘IO是性能瓶颈；如果 `%util` 高但 `await` 低，说明只是吞吐量大但响应正常。

## 网络性能分析
1. netstat -s
2. iftop

### netstat -s 使用示例
```
netstat -s
```
输出按协议分类的统计信息（IP/ICMP/TCP/UDP），无需指定间隔，是累计计数器（从系统启动或计数器归零算起）。常关注的部分：

```
Tcp:
    ... segments retransmitted        # TCP重传次数，过高说明网络质量差或对端处理慢
    ... resets sent/received          # 连接被重置的次数
    ... times used SACK for repair    # SACK恢复使用次数
Udp:
    ... packet receive errors         # UDP接收错误（常见于接收buffer溢出）
    ... receive buffer errors
    ... send buffer errors
```

常用排查思路：
```
netstat -s | grep -i retrans          # 只看重传相关，判断网络是否丢包严重
netstat -s | grep -i "listen drops"   # 查看是否有连接因accept队列满被丢弃
netstat -s | grep -i "buffer errors"  # 查看是否有UDP收发缓冲区不足的问题

//  结合时间间隔观察增量（两次采样做差，比看累计值更直观）
netstat -s > /tmp/s1; sleep 5; netstat -s > /tmp/s2; diff /tmp/s1 /tmp/s2
```

### iftop 使用示例
```
sudo iftop -i eth0
```
实时显示指定网卡上各连接的带宽占用，类似"网络版的top"。常用参数：

| 参数 | 含义 |
| :--- | :--- |
| `-i <iface>` | 指定要监控的网卡 |
| `-n` | 不对IP做DNS反查（避免卡顿，排查时建议加上） |
| `-P` | 显示端口号 |
| `-N` | 不将端口号转换为服务名（配合-P更直观） |
| `-B` | 以字节（Byte）而非比特（bit）为单位显示 |

常用组合：
```
sudo iftop -i eth0 -nNP     # 不做DNS/端口名反查，显示端口号，排查具体是哪个连接占满带宽
```
交互操作：运行后按 `t` 切换显示模式（含/不含端口），按 `p` 切换端口显示，按 `q` 退出。界面上半部分显示当前活跃连接及其实时/2s/10s平均带宽，下半部分显示总流量统计（TX/RX/TOTAL）。

## sar
`sar`（System Activity Reporter，属于 sysstat 包）可以对 CPU、内存、磁盘、网络等多个维度做统一的历史/实时监控，语法统一为 `sar [参数] [间隔秒数] [采样次数]`。

### 安装与开启历史采集
```
sudo apt-get install sysstat
sudo systemctl enable --now sysstat   # 开启后台定时采集，供事后回溯
```
开启后，`/var/log/sysstat/`（或 `/var/log/sa/`）下会按天生成数据文件（如 `sa06`），即使问题已经过去，也能用 `sar -f /var/log/sysstat/sa06` 回溯当天的历史数据。

### CPU
```
sar -u 1 5          # 每秒采样一次，共5次，查看CPU使用率
sar -u -P ALL 1     # 查看每个核心分别的CPU使用率（-P ALL）
sar -u -P 0 1       # 只看0号核心
```
关键字段：`%user`（用户态）、`%system`（内核态）、`%iowait`（等待IO的CPU空闲占比，偏高说明IO是瓶颈）、`%idle`（空闲）。

```
sar -q 1 5          # 查看系统平均负载（runq-sz运行队列长度、load average）
```

### 内存
```
sar -r 1 5          # 查看内存使用情况（%memused、kbcommit、kbbuffers、kbcached等）
sar -R 1 5          # 查看内存变化速率（页分配/释放速率）
sar -B 1 5          # 查看换页（swap）活动：pgpgin/s、pgpgout/s、majflt/s（缺页异常率）
sar -S 1 5          # 查看swap空间使用情况
```

### 磁盘 IO
```
sar -d -p 1 5       # 查看各磁盘设备IO情况，-p使用可读设备名而非dev编号
```
关键字段：`tps`（每秒IO请求数）、`rkB/s`/`wkB/s`（读写吞吐）、`await`（平均等待时间）、`%util`（设备繁忙度），与 `iostat -x` 含义基本一致，适合长期趋势对照。

### 网络
```
sar -n DEV 1 5      # 查看各网卡的收发流量（rxkB/s、txkB/s、rxpck/s、txpck/s）
sar -n EDEV 1 5     # 查看网卡错误统计（rxerr/s、txerr/s、rxdrop/s等）
sar -n TCP,ETCP 1 5 # 查看TCP连接及错误统计（active/s主动连接数、retrans/s重传数）
sar -n SOCK 1 5     # 查看socket使用情况（totsck总数、tcpsck、udpsck等）
```

### 进程上下文切换与中断
```
sar -w 1 5          # 每秒上下文切换次数（cswch/s）和进程创建速率（proc/s）
sar -I SUM 1 5       # 查看所有中断总数
```

### 回溯历史数据
```
sar -u -f /var/log/sysstat/sa06                # 回看指定日期的CPU历史数据
sar -r -s 09:00:00 -e 10:00:00 -f /var/log/sysstat/sa06   # 只看某个时间段（-s起始 -e结束）
```
排查思路：出问题时若没有实时监控在跑，第一时间用 `sar -f` 结合 `-s/-e` 圈定时间窗口，往往能定位到当时是CPU、内存、磁盘还是网络出现异常，再用 `pidstat`/`iostat`/`iftop` 等工具进一步定位到具体进程或连接。

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
3. `google-pprof --text --alloc_space ../install/iot/lib/iot/iot iot.mem.0507.heap` // 历史内存分配情况
4. `google-pprof --text --inuse_space ../install/iot/lib/iot/iot iot.mem.0507.heap` // 当前内存使用情况

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

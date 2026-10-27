[TOC]

# Linux 性能分析精简版（CPU / 网络 / 磁盘）

## 0. 安装：

```bash
sudo apt install sysstat procps iproute2 net-tools ethtool tcpdump \
    iperf3 iftop fio iotop lsof util-linux strace gdb
sudo apt install linux-tools-common linux-tools-$(uname -r)   # perf
```

---

## 1. CPU

### 1.1 工具选择

| 工具 | 用途 |
|---|---|
| `uptime` / `top` | 负载、CPU 总览、进程排行 |
| `mpstat` | 各逻辑核分布（单核瓶颈、软中断集中） |
| `pidstat` | 进程/线程 CPU、上下文切换 |
| `vmstat` | 运行队列、阻塞、切换、CPU 状态 |
| `sar` | 实时/历史 CPU、负载 |
| `perf` | 热点函数、调用栈、硬件事件 |
| `strace` | 系统调用与阻塞定位 |
| PSI / cgroup | CPU 等待与配额限流 |

### 1.2 常用命令

```bash
uptime
top -H -p 4427
top -b -d 1 -n 5 -p 4427

mpstat -P ALL 1 5
mpstat -I SUM -P ALL 1 5

pidstat -u -t -p 4427 1 5
pidstat -w -t -p 4427 1 5
pidstat -u -I -p 4427 1 5          # -I 除以核数，注意口径变化

vmstat -w 1 5
vmstat -w -y 1 5                   # 支持 -y 的版本跳过首份报告

sar -u ALL 1 5
sar -P ALL 1 5
sar -q 1 5
sar -w 1 5

sudo perf stat -p 4427 -e task-clock,context-switches,cpu-migrations,page-faults,cycles,instructions -- sleep 10
sudo perf top -p 4427
sudo perf record -F 99 -g -p 4427 -- sleep 10
sudo perf report --stdio

sudo strace -f -tt -T -p 4427
sudo strace -f -tt -T -e trace=network -p 4427
sudo strace -f -tt -T -e trace=%file,fsync,fdatasync -p 4427
sudo strace -f -c -p 4427
```

### 1.3 判读要点

**`top` CPU 字段：**

- `us` 用户态：查计算、序列化、拷贝、压缩。
- `sy` 内核态：查系统调用、网络处理、调度、内存管理。
- `si` 软中断：联合包速率和软中断分布。
- `wa`：CPU 的 I/O 等待记账，不等于磁盘利用率。
- `st`：虚拟机被宿主机占用的时间。
- 进程 `245%` ≈ 2.45 个逻辑 CPU，不是整机 245%。
- Load average 含可运行和不可中断睡眠任务，不是 CPU 使用率；4 核与 32 核意义不同。

**`mpstat`：** 某核满载而整机空闲 → 串行热点、绑核、锁竞争、任务分配不均。某核软中断高 → 查网卡队列、IRQ 分布、流量。

**`pidstat`：**

- `TGID` 是线程组 ID（通常即进程 PID），`TID` 是线程 ID；进程行与线程行不能重复相加。
- `%wait` 是可运行但等 CPU 的时间比例，不是磁盘 I/O 等待；支持情况依版本。
- `cswch/s` 自愿切换（等锁、条件变量、I/O、休眠）；`nvcswch/s` 非自愿切换（时间片到期、被抢占）。频繁切换不等于异常，要结合吞吐和延迟。

**`vmstat`：**

| 字段 | 含义 |
|---|---|
| `r` | 可运行任务数（含等 CPU）；持续超过核数且 CPU 忙 → 调度竞争 |
| `b` | 等 I/O 的阻塞任务数 |
| `in` / `cs` | 中断 / 上下文切换速率 |
| `si` / `so` | 换入/换出，持续非零查内存压力 |
| `us/sy/id/wa/st` | CPU 时间比例 |

**`sar -q`：** `runq-sz`、`blocked` 区分等 CPU 与阻塞任务；`plist-sz` 是任务列表大小，不是占用 CPU 的任务数。

**历史回溯：** 文件常见于 `/var/log/sysstat/saDD` 或 `/var/log/sa/saDD`，先确认采集服务和实际文件名（仅安装不保证有数据）。

```bash
ls /var/log/sysstat/; systemctl list-timers '*sysstat*'
sar -u -f /var/log/sysstat/sa07 -s 10:00:00 -e 10:30:00
```

历史采样若每 10 分钟一次，易漏短暂峰值。

**`perf`：** `task-clock / 墙钟时间` ≈ 平均使用 CPU 数；IPC 用于同类负载对比，低 IPC 本身不能证明代码有问题。热点百分比是采样事件占比。无帧指针可试 `--call-graph dwarf`（开销更大）。无法采样先查权限、`kernel.perf_event_paranoid`、容器限制，不要直接改安全配置。

**`strace` / `ptrace`：**

- `-T` 显示单次系统调用耗时；`poll/epoll_wait/futex/recvfrom/read/fsync` 长时间不返回，结合线程状态、调用栈、业务时序判断是正常等待还是异常阻塞。
- `-e trace=help` 查看支持的过滤类别。
- `-c` 汇总不能替代逐次时间线。
- 附加跟踪受权限、Yama `ptrace_scope`、容器 seccomp 限制。
- 会暂停/干预线程并带来开销，可能放大延迟；生产机器人、低延迟服务、高频 DDS 应先短时间窄范围采集。
- 输出可能含敏感路径、地址、业务数据，注意脱敏。
- `ptrace` 是内核机制，不是独立命令；`strace`、`gdb` 利用它。

**PSI / cgroup（CPU 有空闲但服务延迟高）：**

```bash
cat /proc/pressure/cpu
cat /proc/4427/cgroup
cat /sys/fs/cgroup/<service-path>/cpu.max
cat /sys/fs/cgroup/<service-path>/cpu.stat
```

- PSI `some` = 至少一个任务因缺该资源停顿的时间比例；`avg10/60/300` 为窗口平均百分比；`total` 为累计微秒。
- 系统级 CPU `full` 不用于判断 CPU 饱和（语义不同于 cgroup 级）。
- `cpu.max` 如 `200000 100000` ≈ 平均 2 个 CPU 预算。
- `cpu.stat` 中 `nr_throttled`、`throttled_usec` 持续增长说明限流；这是限流统计，不是某线程端到端等待时长。

---

## 2. 网络

### 2.1 工具选择

| 工具 | 用途 |
|---|---|
| `ss` | Socket 状态、队列、TCP 细节、进程归属 |
| `netstat` | 连接、接口/协议累计统计（兼容旧环境） |
| `sar -n` | 吞吐、包速率、错误、重传趋势 |
| `ip` / `nstat` | 接口计数、路由、协议计数 |
| `ethtool` | 链路速率、驱动计数器、offload |
| `tcpdump` | 报文验证、保存 pcap |
| `iftop` | 按端点看实时带宽 |
| `iperf3` | 主动吞吐/UDP 测试 |
| `pidstat` / `perf` | 网络线程 CPU 与热点 |

**注意：** `pidstat` 不提供通用进程网络字节统计，`iostat` 不是网络工具；不要把 `pidstat -d` 当网速。

### 2.2 常用命令

```bash
sudo ss -lntup
sudo ss -tanp
sudo ss -uanpm
ss -s
sudo ss -tinp '( sport = :8080 or dport = :8080 )'
sudo ss -uanpm 'sport = :7411'

sudo netstat -lntup
netstat -s; netstat -su; netstat -i

sar -n DEV 1 5
sar -n EDEV 1 5
sar -n TCP,ETCP 1 5
sar -n UDP 1 5

ip -br addr
ip route get 192.0.2.10
ip -s link show dev eth0
nstat -azs                         # 绝对计数，便于自行求差

sudo ethtool eth0
sudo ethtool -S eth0
sudo ethtool -k eth0

sudo tcpdump -i eth0 -nn -tttt -c 100 'tcp port 8080'
sudo tcpdump -i lo -nn -tttt -c 100 'udp port 7411'
sudo tcpdump -i lo -nn -s 0 -C 50 -W 4 -w /tmp/dds.pcap 'udp port 7411'

sudo iftop -i eth0 -n -N -P -t -s 10 -L 20
sudo iftop -i lo -n -N -P -t -s 10 -L 20 -f 'udp port 7411'

iperf3 -s                                     # 另一台机器
iperf3 -c 192.0.2.10 -t 10
iperf3 -c 192.0.2.10 -R -t 10
iperf3 -c 192.0.2.10 -P 4 -t 10
iperf3 -c 192.0.2.10 -u -b 100M -t 10         # UDP 从低速率开始
```

### 2.3 判读要点

**`ss` TCP 队列：**

| 字段 | 已建立连接的含义 | 排查方向 |
|---|---|---|
| `Recv-Q` | 已接收但应用未读字节 | 消费速度、线程调度、锁竞争 |
| `Send-Q` | 未获对端确认的发送字节 | 对端窗口、拥塞、丢包、对端处理 |
| `rtt/rttvar` | 平滑 RTT 及波动（ms） | 与正常基线比较 |
| `rto` | 重传超时（ms） | 结合重传与延迟 |
| `cwnd` | 拥塞窗口（按段） | 不能直接当吞吐 |

队列短暂非零可能正常；持续增长并伴随延迟更值得关注。`LISTEN` 行队列是连接 backlog，不是数据字节。UDP 的 `skmem` 是内核队列/内存记账，不能直接换算应用消息数；`UNCONN` 是未 connect 的 UDP 正常状态。

**`netstat -su`：** 接收缓冲错误增长 → 查应用读取及时性、接收线程阻塞、包速率、缓冲配置；未知端口增长 → 查目标端口、监听生命周期、报文到达时间。不同错误计数可能包含关系，不能简单相加；这些是网络命名空间累计值，不是某 PID 独占。

**`sar -n DEV`：** `rxkB/s × 1024 × 8` 换算 bit/s，注意字节/比特、1024/1000。`%ifutil` 依赖链路速率与双工信息，全双工一般取收发较大方向，不能双向相加；回环接口该字段不适合作饱和依据。TCP 重传字段新版可能为 `retrseg/s`；重传增长需链路、拥塞、对端和抓包证据，本身不定位节点。

**`ip -s link` / `nstat`：** 关注计数变化。`ListenOverflows`/`ListenDrops` 增长 → 查监听队列、accept 速度、连接峰值；相关指标不能简单累加。接口丢包、驱动队列丢包、UDP 缓冲丢包在不同层，计数不一定一一对应。`nstat` 默认模式有历史差值行为，脚本要明确选项。

**`ethtool -S`：** 计数器名称依驱动而异；单个 RX 队列丢包增长且某核软中断高 → 查队列分布、IRQ 亲和性、消费者速度。`ethtool -k` 只查 offload；GRO/GSO/TSO 会影响抓包包大小，不能凭抓到“超大包”断定线上帧大小。

**`tcpdump`：**

- 通常只解码到 UDP 层，判断 DDS 的 DATA_FRAG/ACKNACK 需 RTPS 解码器。
- DDS 可靠性重传在 UDP 之上，不计入 TCP 重传统计。
- 回环流量不走物理网卡，但仍消耗 CPU、协议栈、Socket 缓冲。
- 抓包有开销，用接口/端口/数量/轮转限制。
- 停止时 `packets dropped by kernel` 是抓包机制未交付的包，不等于业务 Socket 丢包。

**`iftop`：**

- 三列通常是 2/10/40 秒滑动平均；启动不足窗口长度时不能当长期平均值。
- `Mb`（比特）与 `MB`（字节）要区分，与 `sar` 比较时统一单位。
- `-P` 显示端口，`-n/-N` 关闭解析。
- 先用 iftop 找端点，再用 `ss -p` 找进程；它不是“进程网速排行榜”。
- 共享内存通信不在接口统计内。

**`iperf3`：** 接收端结果更接近实际交付吞吐；发送端 `Retr` 辅助看重传。主动测试会占网络和 CPU，应在允许窗口运行。它只能证明该测试路径在该负载下正常，不能证明 DDS、小包高 PPS、组播、序列化、应用处理正常；小包场景可能先到 CPU/PPS 上限。

**网络线程 CPU：**

```bash
pidstat -u -w -t -p 4427 1 5
mpstat -P ALL 1 5
sudo perf top -p 4427
sudo perf top -a                  # 软中断开销进程级可能看不到
cat /proc/softirqs
```

线程名只用于定位，不证明故障原因；联合 PPS、Socket 队列、UDP 错误、调用栈区分包太多、拷贝开销、消费者慢、协议重传。

---

## 3. 磁盘

### 3.1 工具选择

| 工具 | 用途 |
|---|---|
| `df` / `lsblk` | 容量、inode、挂载与设备拓扑 |
| `iostat` | 块设备吞吐、IOPS、延迟、队列 |
| `pidstat -d` | 进程/线程 I/O 速率与延迟记账 |
| `iotop` | 实时 I/O 活跃任务 |
| `sar -d` | 实时/历史设备 I/O |
| `vmstat` | 阻塞任务、换页、整体 I/O |
| `lsof` | 文件归属、删除后仍占空间 |
| `/sys/block/*/queue` | 旋转属性、调度器 |
| `vmstat -d` | 块设备累计统计 |
| `fio` | 可控压测、IOPS、尾延迟 |
| PSI | I/O 对任务停顿的影响 |

NFS 等网络文件系统故障需同时查网络与存储侧，本地 `iostat` 空闲不能排除远端问题。

### 3.2 常用命令

```bash
df -hT; df -i
lsblk -o NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS
findmnt -T /var/log

iostat -xzk -y 1 5
iostat -xm -y 1 5
iostat -xz -y nvme0n1 1 5

pidstat -d -p ALL 1 5
pidstat -d -t -p 4427 1 5
cat /proc/4427/io

sudo iotop -o
sudo iotop -o -P
sudo iotop -b -o -P -d 1 -n 5

sar -b 1 5
sar -d -p 1 5
sar -d -p -f /var/log/sysstat/sa07 -s 10:00:00 -e 10:30:00

vmstat -w 1 5
cat /proc/pressure/io
ps -eo pid,tid,stat,wchan:32,comm

sudo lsof -p 4427
sudo lsof +L1

cat /sys/block/vda/queue/rotational
cat /sys/block/vda/queue/scheduler
lsblk -d -o NAME,ROTA,SCHED,SIZE,MODEL

vmstat -d
vmstat -d 1 5
vmstat -D
```

### 3.3 判读要点

**`df` / `lsblk`：** 容量 95% 是线索但不直接证明 I/O 瓶颈；inode 用尽即使有字节空间也会创建失败。涉及 LVM、RAID、dm-crypt、overlay 需确认真实数据路径，不同设备层吞吐不能重复相加。

**`iostat -x`：**

| 字段 | 含义 | 判读 |
|---|---|---|
| `r/s`、`w/s` | 每秒完成读/写请求数 | 块层 IOPS，不等于应用调用次数 |
| `rkB/s`、`wkB/s` | 读写吞吐 | 单位以表头为准 |
| `r_await`、`w_await` | 平均请求耗时（ms，含排队与服务） | 与基线和业务需求比较 |
| `rareq-sz`、`wareq-sz` | 平均请求大小 | 小随机与大顺序要分开比 |
| `aqu-sz` | 平均在途请求数/队列长度 | 看是否伴随 await 增长、吞吐停滞 |
| `%util` | 设备有 I/O 活动的时间比例 | 不等于容量/带宽/最大性能使用率 |

常见误区：

- NVMe/RAID 上 `%util=100%` 不一定到上限，低于 100% 也不证明无延迟问题。
- `await` 是平均值，不能替代 p95/p99，也不是纯硬件服务时间。
- 页缓存命中的读可能没有块设备 I/O；应用写可能先进页缓存再异步回写。
- 虚拟盘、云盘、RAID 后端可能有宿主或远端限制。

**`pidstat -d`：**

- `kB_rd/s`、`kB_wr/s` 是内核任务 I/O 记账，与应用逻辑字节量可能不同。
- `kB_ccwr/s` 是取消的写入速率（如脏页写出前被截断/删除）。
- `iodelay` 单位是时钟 tick，不是毫秒，不能机械换算请求平均时延。

`/proc/PID/io`：`rchar/wchar` 是 read/write 等接口的累计逻辑字节（可能含缓存命中、非磁盘文件）；`read_bytes/write_bytes` 更接近存储层记账。两者不能互换，也不能当网络流量。

**`iotop`：** `-P` 汇总进程，默认可能显示线程；`IO>` 若可用是任务等 I/O 比例，不是磁盘 `%util`。部分内核/版本需 taskstats 和延迟记账，缺失或为零不能证明无等待。顶部总计、单进程速率与 `iostat` 因缓存和统计层次不同不一定完全相等。

**`sar -d`：** `tps` 是设备层每秒完成的传输/请求统计（部分版本含 discard），不等于应用调用次数；`await` 是读写汇总平均值，可能掩盖“读快写慢”，需 `iostat -x` 区分。旧版字段可能为 `avgrq-sz`、`avgqu-sz`。

**`vmstat` / PSI：**

- `b`、I/O PSI 与设备 `await` 同时升高 → I/O 与服务停顿相关。
- I/O 的 `full` 有实际意义（所有非空闲任务同时停顿的时间），不同于系统级 CPU `full`。
- `D` 状态是不可中断睡眠，可能涉及本地存储、远端文件系统或其他内核等待，不应一律解释为物理磁盘故障。

**`lsof +L1`：** 文件已删除但进程仍持 fd，空间要等最后一个引用关闭才释放；应用日志应使用支持的重开/轮转机制，不要直接杀业务进程。`lsof` 证明归属，不能单独测读写速率或延迟。

**`/sys/block/*/queue`：**

| 项目 | 解释 |
|---|---|
| `rotational=1/0` | 内核标记为旋转/非旋转型；不等于已确认 NVMe/SSD/真实型号 |
| scheduler 方括号 | 当前选择的调度器，如 `[mq-deadline]` |
| `[none]` | 当前无块层 elevator 算法；仍有请求队列、驱动、设备端处理，不等于“无调度/排队” |

虚拟机 vda 的 rotational 由虚拟化栈呈现，不能凭 `1` 断定宿主机机械盘，也不能凭 `0` 推断 SSD 型号。调度器没有对所有设备和负载都最佳的选择；应固定 fio 访问模式、块大小、并发、缓存方式对比吞吐和尾延迟。`vda` 要替换为实际整盘名；容器/叠加文件系统先用 `findmnt` 和设备拓扑确认。

**`vmstat -d`：**

| 列 | 含义 | 注意 |
|---|---|---|
| `reads/writes total` | 累计完成请求数 | 不是每秒 IOPS |
| `merged` | 累计合并请求数 | 块层合并，不是额外完成 I/O |
| `sectors` | 累计扇区数 | Linux 磁盘统计按 512 字节扇区记账 |
| `ms` | 累计请求耗时（ms） | 并发请求耗时可重叠，不是墙钟时间 |
| `cur` | 当前在途 I/O 数 | 瞬时值，不是平均队列长度 |
| `sec` | 累计 I/O 活动时间（s） | 不是平均响应时间 |

周期输出仍为累计统计，要对同一设备求差。例：1 秒间隔 `reads total` +1000、`read sectors` +8000 ≈ 1000 读 IOPS、`8000×512/1024/1024 ≈ 3.91 MiB/s`。`Δread_ms/Δread_total` 可粗略估计块层平均读耗时，但日常优先用 `iostat -x` 的 `r_await/w_await`。多个设备层可能重复描述同一笔 I/O，不要简单相加。

### 3.4 fio 基准测试

先确认是 Flexible I/O Tester：`fio --version` 应为 `fio-3.x`（有些 Python 软件同名，不能混用）。

**准备独立测试文件**（`--rw=write/randwrite` 会修改文件，不要把 `--filename` 指向业务文件或 `/dev/vda`）：

```bash
FIO_TEST_DIR=$(mktemp -d /tmp/fio-test.XXXXXX)

fio --name=prepare --filename="$FIO_TEST_DIR/data.bin" \
    --size=64M --rw=write --bs=1M --ioengine=sync \
    --iodepth=1 --numjobs=1 --direct=0 --end_fsync=1 \
    --group_reporting
```

`/tmp` 可能位于 tmpfs、overlay 等；评估真实路径时在该路径下新建目录，用 `findmnt -T` 确认文件系统，记录虚拟化和缓存层。

**顺序读 / 随机读：**

```bash
fio --name=seqread --filename="$FIO_TEST_DIR/data.bin" \
    --size=64M --rw=read --bs=1M --ioengine=sync \
    --iodepth=1 --numjobs=1 --direct=1 \
    --readonly --allow_file_create=0 --group_reporting

fio --name=randread --filename="$FIO_TEST_DIR/data.bin" \
    --size=64M --rw=randread --bs=4k --ioengine=sync \
    --iodepth=1 --numjobs=1 --direct=1 \
    --time_based=1 --runtime=5 --readonly --allow_file_create=0 \
    --percentile_list=50:95:99:99.9 --group_reporting
```

`direct=1` 请求直接 I/O，不等于绕过所有虚拟化/设备缓存，也不保证数据持久化；文件系统不支持时保留错误，若改 `direct=0` 必须标明是缓冲 I/O。

**随机写 / 异步深度：**

```bash
fio --name=randwrite --filename="$FIO_TEST_DIR/data.bin" \
    --size=64M --rw=randwrite --bs=4k --ioengine=sync \
    --iodepth=1 --numjobs=1 --direct=1 \
    --time_based=1 --runtime=5 --end_fsync=1 --group_reporting

fio --name=randread_qd32 --filename="$FIO_TEST_DIR/data.bin" \
    --size=64M --rw=randread --bs=4k --ioengine=libaio \
    --iodepth=32 --numjobs=1 --direct=1 \
    --time_based=1 --runtime=5 --readonly --allow_file_create=0 \
    --group_reporting
```

同步 `sync` 引擎单 job 设 `iodepth=32` 不会获得 32 并行请求；异步引擎也要看输出 `IO depths` 是否达到期望。`numjobs` 是 job 数，`iodepth` 是每 job 目标深度。若业务依赖 `fsync/fdatasync`，要专门测同步落盘频率；仅看普通写 IOPS 或最后一次 `end_fsync` 不能评价每条日志同步落盘的延迟。

**结果判读：**

| 指标 | 解释 |
|---|---|
| `err` | 先确认无错误、确实完成 I/O |
| `IOPS` | 每秒完成 fio I/O 数；注明模式、块大小、深度 |
| `BW` | 吞吐；固定 4 KiB 时 25k IOPS ≈ 97.7 MiB/s |
| `slat` | 提交延迟（引擎支持时） |
| `clat` | 完成延迟，不等于业务端到端时延 |
| `lat` | fio 观察到的总 I/O 延迟 |
| `percentiles` | 看清是 clat 还是 lat 及 us/ms/ns |
| `IO depths` | 实际深度分布，验证并发 |

64 MiB、几秒的小测试只验证命令、路径、引擎行为。正式基准应设合理数据规模、运行时间、预热和重复次数，记录缓存、CPU 配额、存储限流；不要把小文件或沙盒结果当物理磁盘结论。

---

## 4. 联合排查

| 现象 | 先看 | 再看 | 可验证方向 |
|---|---|---|---|
| 整机 CPU 高 | top、mpstat | pidstat、perf | 用户计算、系统调用、软中断 |
| CPU 不高但单任务慢 | mpstat、pidstat -t | perf、PSI、cgroup | 单核、锁、配额、串行路径 |
| 上下文切换多 | vmstat、pidstat -w | 热点线程和调用栈 | 唤醒过密、争用、任务粒度 |
| 网速不高但丢包 | sar -n DEV/EDEV | ss、nstat、ethtool、mpstat | PPS、缓冲、网卡队列、消费者 |
| TCP 延迟/吞吐恶化 | ss -ti、sar -n ETCP | tcpdump、两端采样 | 重传、窗口、链路、对端 |
| DDS/UDP 流量增长 | sar -n DEV、ss -u | tcpdump + RTPS 解码、线程 CPU | 消息体增长、协议重传、实体生命周期 |
| 写日志时停顿 | iostat、pidstat -d | iotop、PSI、热点调用 | 同步写、fsync、回写、磁盘排队 |
| iowait 高 | vmstat、iostat | sar -d、D 状态、PSI | 本地设备或其他 I/O 等待 |
| 磁盘空闲但写文件失败 | df -hT、df -i | 挂载属性、应用错误码 | inode、配额、只读挂载 |

以上是排查方向，不是仅凭现象即可得出的根因。

---

## 5. 命令速查

| 类别 | 目的 | 命令 |
|---|---|---|
| CPU | 总览 | `top`、`uptime` |
| CPU | 分核 | `mpstat -P ALL 1 5` |
| CPU | 线程 CPU | `pidstat -u -t -p 4427 1 5` |
| CPU | 上下文切换 | `pidstat -w -t -p 4427 1 5` |
| CPU | 队列与阻塞 | `vmstat -w 1 5`、`sar -q 1 5` |
| CPU | 热点 | `sudo perf top -p 4427` |
| 系统调用 | 跟踪及耗时 | `sudo strace -f -tt -T -p 4427` |
| 系统调用 | 统计 | `sudo strace -f -c -p 4427` |
| 调试 | ptrace 附加调试 | `gdb -p 4427`；`ptrace` 本身是系统调用接口 |
| 网络 | 监听端口 | `sudo ss -lntup`、`sudo netstat -lntup` |
| 网络 | TCP 内部信息 | `sudo ss -tinp` |
| 网络 | UDP 缓冲/归属 | `sudo ss -uanpm` |
| 网络 | 吞吐/PPS | `sar -n DEV 1 5` |
| 网络 | 错误/重传 | `sar -n EDEV,TCP,ETCP,UDP 1 5` |
| 网络 | 累计计数 | `netstat -s`、`nstat -azs`、`ip -s link` |
| 网络 | 驱动计数器 | `sudo ethtool -S eth0` |
| 网络 | 端点带宽 | `sudo iftop -i eth0 -n -N -P -t -s 10` |
| 网络 | 抓包 | `sudo tcpdump -i lo -nn -c 100 'udp port 7411'` |
| 磁盘 | 容量/inode | `df -hT`、`df -i` |
| 磁盘 | 设备指标 | `iostat -xzk -y 1 5` |
| 磁盘 | 进程指标 | `pidstat -d -p ALL 1 5` |
| 磁盘 | 活跃任务 | `sudo iotop -o -P` |
| 磁盘 | 历史指标 | `sar -d -p -f /var/log/sysstat/sa07` |
| 磁盘 | 旋转属性/调度器 | `cat /sys/block/vda/queue/rotational`、`.../scheduler` |
| 磁盘 | 累计设备统计 | `vmstat -d 1 5` |
| 磁盘 | 主动基准 | 第 3.4 节 fio 命令 |
| 磁盘 | 文件归属 | `sudo lsof -p 4427`、`sudo lsof +L1` |

---
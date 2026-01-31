## 生成core
1. `ulimit -c unlimited`
2. `sudo sh -c 'echo "core-%e-%p-%t" > /proc/sys/kernel/core_pattern'`

## 运行时生成core
1. `gcore pid`

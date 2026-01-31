http://brpc.incubator.apache.org/zh/docs/
https://brpc.apache.org/docs/getting_started/#ubuntulinuxmintwsl
[百度C++工程师的那些极限优化](https://blog.csdn.net/weixin_41055260/article/details/118716132)
[brpc中资源池/对象池的源码剖析](https://blog.csdn.net/yockie/article/details/111425457)
[brpc组件bvar源码解析（一）简介、使用和类的关系](https://blog.csdn.net/yockie/article/details/124577602)
[brpc源码解析](https://blog.csdn.net/wxj1992/category_11267957.html)
[brpc源码学习](https://blog.csdn.net/kidgin7439/category_10022503.html)


bvar
bthread
bthread Execution Queue / asio strand

## channel
Channel可以被所有线程共用,因为Channel.CallMethod()是线程安全的，但是创建和Init并不是线程安全的。options为所有参数取默认值，使用非默认值需单独修改。
```
brpc::ChannelOptions options;  // 包含了默认值
options.xxx = yyy;
...

brpc::Channel channel;
channel.Init(..., &options);
channel.options()				//获得channel在使用的所有选项。
```
Init()可以链接单台服务器或服务器集群，可通过load_balancer_name置空置空统一init的创建。
```
int Init(const char* server_addr_and_port, const ChannelOptions* options);
int Init(const char* naming_service_url, const char* load_balancer_name, const ChannelOptions* options);
```

## NamingService
https://brpc.incubator.apache.org/zh/docs/rpc-in-depth/load-balancing/#%E5%91%BD%E5%90%8D%E6%9C%8D%E5%8A%A1
consul://<service-name>
bns://<bns-name>

## load_balancer_name
### rr 
round robin
### wrr
wrr
### random
### wr 
weighted random
### la
[doubly-buffered-data](https://blog.csdn.net/kdb_viewer/article/details/106279315)数据分前后台，通过修改atomic<int>index保证读线程获取到最新的内容，甚至每个读线程保存一个index，写线程挨个修改读线程自己的atomic<int>index。从而实现更细粒度的无锁。
[Locality-aware](https://brpc.incubator.apache.org/zh/docs/rpc-in-depth/locality-aware/)优先选择延时低的下游，直到其延时高于其他机器，无需其他设置.简单来说假使W代表权值，QPS代表吞吐，L代表延时，那么W1 = QPS1 / L1和W2 = QPS2 / L2分别是这两个节点的分流权值，分流时随机数落入的权值区间就是流量的目的地了。所以实现该算法的前提是实现qps以及延时的统计即bvar。而事实上的la公式如下
```
inflight delay:当前时间 - 发出时间之和 / 未结束次数
base_weight = QPS * WEIGHT_SCALE / latency ^ p
weight = base_weight * avg_latency / inflight_delay
```
### c_murmurhash or c_md5
[一致性哈希](https://brpc.incubator.apache.org/zh/docs/rpc-in-depth/consistent-hashing/)为每个server计算m个hash值，从而把32位整数值域划分为n * m个区间。当增加或者一处服务器时就可以将数据的rebalance将更均匀。

## 内存模型内存顺序
[聊聊内存模型与内存序](https://mp.weixin.qq.com/s/t5_Up2YZEZt1NLbvgYz9FQ)
[C++11的6种内存序总结](https://blog.csdn.net/mw_nice/article/details/84861651)

## bthreadd
[bRPC的精华全在bthread上啦](https://zhuanlan.zhihu.com/p/294129746)
[bRPC 学习笔记：bthread 线程库](https://www.bilibili.com/read/cv16740145/)




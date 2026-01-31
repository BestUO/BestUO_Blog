[TOC]

# 再谈FreeLockQueue

## 简介
&#8195;&#8195;FreeLockQueue是一个陈年旧问，之前研究过一段时间但本蛙没有做文字记录。看了[这篇文章](https://www.cnblogs.com/shines77/p/4192787.html)又有了新的体会，记录之。

## 概念
&#8195;&#8195;首先队列的作用是解耦合，一般的保证队列同步的方法是加锁mutex。而因为mutex开销大，在多线程环境下mutex的竞争也会消耗比较大的计算能力，所以才有FreeLockQueue。需要注意的是FreeLockQueue并不是真正的无锁，而是用原子操作以及算法代替mutex，从而提升性能。  
&#8195;&#8195;原子操作本身也可以通过构造自旋锁代替mutex，这样一来cpu将是满负荷运载，在某些场景下也是有其意义所在，但这场景不在本文讨论范围内。
## 原理
&#8195;&#8195;freelockqueue的本质就是CAS（Compare And Swap）代码形如：

```c++
bool compare_and_swap (int *addr, int oldval, int newval)
{
    if ( *addr != oldval )
        return false;
    *addr = newval;
    return true;
}
```
&#8195;&#8195;但是compare_and_swap 函数执行了多条机器指令，在多线程不加锁的情况下变量不是线程安全的，所以有了原子操作：gcc下的__sync_bool_compare_and_swap以及c++11的compare_exchange_weak或者compare_exchange_strong。

## 基于链表的无锁队列
&#8195;&#8195;enqueue的操作很简单，向队列最末添加新节点，如果失败就重试，最后更新Q->tail节点指向新节点。每一步都线程安全。
<center>![图像风格迁移](http://www.aiecent.com/img/18.png)</center>

```c++
EnQueue(Q, data)
{
    n = new node();
    n->value = data;
    n->next = NULL;
    tail = Q->tail;
    do {
            newtail = tail->next;
    } while( CAS(newtail.next, NULL, n) != TRUE);
    CAS(Q->tail, tail, n);
}
```
&#8195;&#8195;DeQueue操作本就是移动head节点返回value,同时`else if ( head == tail && next != NULL ) continue;`解决上述step2中的数据不同步问题
```c++
DeQueue(Q)
{
    while(TRUE) 
    {
        head = Q->head;
        tail = Q->tail;
        next = head->next;
        if ( head == tail && next == NULL ) return nullptr;   
        else if ( head == tail && next != NULL ) continue;
        else if ( CAS( Q->head, head, next) == TRUE)
        {
            value = next->value;
            break;
        }
    }
    delete(head);
    return value;
}
```

## 链表无锁队列优化
* enqueue操作中需要new而new操作本身耗费时间的，如果new比mutex更慢，那不就很尴尬吗。。。。似乎可以用MemoryPool代替new。
* dequeue操作的14行会出现ABA问题，可以用doubleCAS或MemoryPool解决。但就目前使用场景来看，出现了aba问题也并没有影响图片
* 使用bulk，一次性push或者pop多个数据以减少CAS操作失败造成的性能损失。

## 基于环形数组的无锁队列
<center>![图像风格迁移](http://www.aiecent.com/img/19.png)</center>
&#8195;&#8195;毫不夸张的说，环形数组的无锁队列可以解决上述所有问题。至于环形无锁队列的实现高度参考[DPDK](https://www.dpdk.org/)同时为DPDK为了实现高性能，在coding的过程中使用的几个小trick一并介绍。

### cacheline，cache一致性，cache对齐
&#8195;&#8195;cpu与主存传输数据分别要经过L1,L2,L3 cache，其中L3是多个cpu共享的，而L1,L2则是单个cpu独享的，cache的最小存储单元是一般是64K。这个时候如果core1和core2分别要修改int a、int b。好巧不巧a、b都在一个cacheline上，就出现cache一致性问题了。幸运的是这个问题不是咱老百姓该担心的，intel的cache MESI Protocol能保证cache一致性。某条指令读写了一个字节内存，那么在内存操作的时候都会把这1字节所在附近的64字节读写一次，这个问题单线程没问题，多线程的话如果同时读写64字节附近的内存会导致读写线程缓存的频繁刷新（MESI Protocol），所以为了性能我们需要进行cache对齐。
<center>![图像风格迁移](http://www.aiecent.com/img/20.png)</center>

### 内存屏障
&#8195;&#8195;一点简单理解：O2优化时编译器会对代码进行乱序优化，其执行结果很可能超出预料。如下t1执行顺序很可能先执行b=1，再执行a=1，此时t2assert失败，我们需要在4~5行以及9~10行间加上内存屏障解决次问题。在FreeLockRingQueue的实现上，也使用到了内存屏障
```c++
int a = b = 0;
std::thread t1([&]()
{
  a = 1;
  b = 1;
})
thread t2([&]()
{
  while (b != 1);
  assert (a == 1);
})
```

### 分支预测/循环展开
&#8195;&#8195;请看之前[博文](http://www.aiecent.com/programs/article/10)

### DPDK之rte_ring代码解析
&#8195;&#8195;以enqueue为例，7行更新prod.head节点，10行将数据塞入到环形队列中，11行更新prod.tail节点。24、43行使用到了上文提到了内存屏障，39/47行则使用了分支预测技术。不仅如此intel为了加快运行效率将每个函数做了内联#define __rte_always_inline inline __attribute__((always_inline)),下面展示代码并没有加上，但实际是有的。
&#8195;&#8195;关于此处的内存屏障其实本蛙还是有些不明所以，在我看来真正起作用的在43行内存写屏障，其作用的防止cpu乱序执行导致ht->tail节点的更新先于ENQUEUE_PTRS完成，至于其他作用还没get到。但代码是intel的，或许有其精妙之处吧。
```c++
unsigned int RTE_Ring::__rte_ring_do_enqueue(struct rte_ring *r, void * const *obj_table,
     unsigned int n, unsigned int is_sp, unsigned int *free_space)
{
  uint32_t prod_head, prod_next;
  uint32_t free_entries;

  n = __rte_ring_move_prod_head(r, is_sp, n, &prod_head, &prod_next, &free_entries);
    if(n)
    {
        ENQUEUE_PTRS(r, &r[1], prod_head, obj_table, n, void *);
        update_tail(&r->prod, prod_head, prod_next, is_sp);
    }
    return n;
}

unsigned int RTE_Ring::__rte_ring_move_cons_head(struct rte_ring *r, int is_sc,  unsigned int n, uint32_t *old_head, uint32_t *new_head,  uint32_t *entries)
{
  unsigned int max = n;
  int success;
  do
  {
    n = max;
    *old_head = r->cons.head;
    rte_smp_rmb();//内存屏障
    *entries = (r->prod.tail - *old_head);
    if (n > *entries)
      n = 0
    if (unlikely(n == 0))
      return 0;

    *new_head = *old_head + n;
    if (is_sc)
      r->cons.head = *new_head, success = 1;
    else
      success = __sync_bool_compare_and_swap(&r->cons.head, *old_head,
          *new_head);
  } while (unlikely(success == 0));//分支预测
  return n;
}

void RTE_Ring::update_tail(struct rte_ring_headtail *ht, uint32_t old_val, uint32_t new_val, uint32_t single)
{
    rte_smp_wmb();//内存屏障
    if (!single)
      while (unlikely(ht->tail != old_val))//分支预测
        rte_pause();
    ht->tail = new_val;
}
```
&#8195;&#8195;环形队列的核心算法与基于链表的算法是相似的，不同点在于边界问题的处理上，很显然基于环形队列的边界问题处理更复杂。链表形式自身维护head，tail两个指针用来指向生产、消费节点，但是环形队列为了解决边界问题，会维护两个rte_ring_headtail类型的结构体prod 、cons ，而这两个结构体又会维护自己独有的tail、head指针，如下。需要说明的是__rte_cache_aligned，他的作用就是上文提到了cache对齐。在c中使用`__attribute__((__aligned__(RTE_CACHE_LINE_SIZE)))`进行对齐和pad，在c++11中可以使用`alignas(64)`代替。
```c++
#define RTE_CACHE_LINE_SIZE 64
#define __rte_cache_aligned
__attribute__((__aligned__(RTE_CACHE_LINE_SIZE)))
  
  struct rte_ring_headtail 
  {
  volatile uint32_t head;  /**< Prod/consumer head. */
  volatile uint32_t tail;  /**< Prod/consumer tail. */
  uint32_t single;         /**< True if single prod/cons */
};

/** Ring producer status. */
 struct rte_ring_headtail prod __rte_cache_aligned;
/** Ring consumer status. */
struct rte_ring_headtail cons __rte_cache_aligned; empty cache line
```

## 写在最后
&#8195;&#8195;[C++11版本环形数组无锁队列](https://github.com/BestUO/littletools/blob/master/queue/ringqueue.hpp)分支预测，cache对齐等有需要的时候再实现
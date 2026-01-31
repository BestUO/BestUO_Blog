## brpc之bthread
[brpc](https://brpc.incubator.apache.org/zh/docs/rpc-in-depth/consistent-hashing/)中的bthread主要由TaskControl、TaskGroup、TaskMeta三大核心组成。本质上是一个有栈协程池，调用函数在TaskGroup等待执行。为提升性能，bthread通过ObjectPool/ResourcePool资源池优化资源申请效率。

## TaskControl
TaskControl全局唯一，通过get_or_new_task_control创建，之后初始化指定数量的TaskGroup。
```C++
inline TaskControl* get_or_new_task_control() {
    butil::atomic<TaskControl*>* p = (butil::atomic<TaskControl*>*)&g_task_control;
    TaskControl* c = p->load(butil::memory_order_consume);
    ...
    for (int i = 0; i < _concurrency; ++i) {
        //TaskGroup create
    }
    ...
}
```

## TaskGroup、TaskMeta
TaskGroup与线程1比1对应。bthread运行在TaskGroup之上。在TaskGroup::init中创建自己的TaskMeta。TaskMeta维护bthread最基本的信息，包括回调函数及参数、协程栈等信息。
```C++
int TaskGroup::init(size_t runqueue_capacity) {
	...
    ContextualStack* stk = get_stack(STACK_TYPE_MAIN, NULL); //创建协程栈空间
    if (NULL == stk) {
        LOG(FATAL) << "Fail to get main stack container";
        return -1;
    }
    butil::ResourceId<TaskMeta> slot;
    TaskMeta* m = butil::get_resource<TaskMeta>(&slot);
    ...
    m->set_stack(stk);
    ...
}
```
run_main_task是TaskGroup主循环。wait_task等待任务到来，sched_to切换bthread运行栈，task_runner运行任务。
```C++
void TaskGroup::run_main_task() {
	...
    while (wait_task(&tid)) {
        TaskGroup::sched_to(&dummy, tid);
        if (_cur_meta->tid != _main_tid) {
            TaskGroup::task_runner(1/*skip remained*/);
        }
    ...
    }
}
```
wait_task优先消费本地_remote_rq，没有则steal其他TaskGroup中的_rq，remote_rq。最后在task_runner的ending_sched中消费自己的_rq。TaskGroup之所以使用2种queue就是为了降低steal时的竞争。
```C++
bool steal_task(bthread_t* tid) {
    if (_remote_rq.pop(tid)) {										//消费本地_remote_rq
        return true;
    }
    return _control->steal_task(tid, &_steal_seed, _steal_offset);	//消费其他TaskGroup的_rq,_remote_rq
}
```
sched_to用于栈切换，创建栈时添加运行函数task_runner。之后的sched_to切换协程栈并运行添加的函数task_runner。
```C++
inline void TaskGroup::sched_to(TaskGroup** pg, bthread_t next_tid) {
    TaskMeta* next_meta = address_meta(next_tid);
    if (next_meta->stack == NULL) {
        ContextualStack* stk = get_stack(next_meta->stack_type(), task_runner);
        if (stk) {
            next_meta->set_stack(stk);
        }
        ...
    }
    sched_to(pg, next_meta);
}
```
需要注意task_runner是带skip_remained参数的，参数通过jump_stack写入0
```C++
inline void jump_stack(ContextualStack* from, ContextualStack* to) {
    bthread_jump_fcontext(&from->context, to->context, 0/*not skip remained*/);
}
#endif
```
task_runner执行回调并查下一个任务。这里有点看不明白，因为之前说过，在run_main_task中的wait_task优先取本地_remote_rq中的bthread_t。但是在ending_sched中优先取_rq中的bthread_t，然后才是本地的_remote_rq以及其他taskgroup的任务。
```C++
    do {
        // Meta and identifier of the task is persistent in this run.
        TaskMeta* const m = g->_cur_meta;
        ... 
        try {
            thread_return = m->fn(m->arg);
        } catch (ExitException& e) {
            thread_return = e.value();
        }
        // Group is probably changed
        g = tls_task_group;
        // TODO: Save thread_return
        (void)thread_return;

        ...
        // 查找下一个任务，并切换到其对应的运行时上下文
        ending_sched(&g);

    } while (g->_cur_meta->tid != g->_main_tid); 
```
## 关于ParkingLot
[ParkingLot与Worker同步任务状态](https://zhuanlan.zhihu.com/p/346081659)讲了ParkingLot的基本功能，简单功能概括就是一个Futex锁，当任务加入队列时通知同一组的TG开始干活。整个tc有4个pl锁，将所有tg分成若干组，每组tg共享一个pl。这里也有不明白的地方，因为通知不到全局的所有的pl假使仅一组pl有任务且很忙碌，如何实现负载均衡。bthread中采用的方法是`c->choose_one_group()->start_background<true>(tid, attr, fn, arg);`即在加入bthread时候随机加入一个tg。至于为什么使用futex有一种说话是Futex在没有竞争的时候不用切换到内核态，保证性能，只有确实有竞争的时候才切换。
## WorkStealingQueue<bthread_t>
WorkStealingQueue是环形无锁队列，但是从push及pop的代码中可以发现该类只支持单线程读写：多线程push时，b、t并一定是最新的值所以`_buffer[b & (_capacity - 1)] = x;`会执行混乱。
```C++
bool push(const T& x) {
    const size_t b = _bottom.load(butil::memory_order_relaxed);
    const size_t t = _top.load(butil::memory_order_acquire);
    if (b >= t + _capacity) { // Full queue.
        return false;
    }
    _buffer[b & (_capacity - 1)] = x;
    _bottom.store(b + 1, butil::memory_order_release);
    return true;
}
```
但正巧TaskGroup是单线程的，仅仅本线程的push及pop刚好能满足需求，唯一的问题是任务steal，通过compare_exchange_strong解决问题，但是steal和pop同时执行的情况下任然会产生问题
```C++
bool steal(T* val) {
    size_t t = _top.load(butil::memory_order_acquire);
    size_t b = _bottom.load(butil::memory_order_acquire);
    if (t >= b) {
        // Permit false negative for performance considerations.
        return false;
    }
    do {
        butil::atomic_thread_fence(butil::memory_order_seq_cst);
        b = _bottom.load(butil::memory_order_acquire);
        if (t >= b) {
            return false;
        }
        *val = _buffer[t & (_capacity - 1)];
    } while (!_top.compare_exchange_strong(t, t + 1,
                                           butil::memory_order_seq_cst,
                                           butil::memory_order_relaxed));
    return true;
}
```
## ObjectPool/ResourcePool
bthread中使用了两种内存池，注释上可以看到ObjectPool是ResourcePool的一个派生类，用于分配没有标识符的对象空间比如协程栈空间。
```C++
//ObjectPool使用场景
inline ContextualStack* get_stack(StackType type, void (*entry)(intptr_t)) {
    switch (type) {
    ...
    case STACK_TYPE_SMALL:
        return StackFactory<SmallStackClass>::get_stack(entry);
    ...
    }
    return NULL;
}
static ContextualStack* get_stack(void (*entry)(intptr_t)) {
    return butil::get_object<Wrapper>(entry);               //这里使用的ObjectPool
}
```
而ResourcePool用于有标识符的比如TaskMeta等
```C++
butil::ResourceId<TaskMeta> slot;
TaskMeta* m = butil::get_resource<TaskMeta>(&slot);
```
### ObjectPool
流程大致是singleton()获取ObjectPool单例，get_object先获取LocalPool指针再从内存池申请对象。需要注意的是get_or_new_local_pool中执行_local_pool = lp前并没有判断_local_pool是否有值，所以在多线程的时候有问题。brpc也在此做出了解释Each thread has an instance of this class.这里的this class就是LocalPool，通过修饰符thread_local或者__thread实现，因此不存在上述问题。
```C++
inline LocalPool* get_or_new_local_pool() {
    LocalPool* lp = _local_pool;
    if (BAIDU_LIKELY(lp != NULL)) {
        return lp;
    }
    lp = new(std::nothrow) LocalPool(this);
    if (NULL == lp) {
        return NULL;
    }
    BAIDU_SCOPED_LOCK(_change_thread_mutex); //avoid race with clear()
    _local_pool = lp;
    butil::thread_atexit(LocalPool::delete_local_pool, lp);
    _nlocal.fetch_add(1, butil::memory_order_relaxed);
    return lp;
}
```
另一个值得注意的是真正获取对象的地方BAIDU_OBJECT_POOL_GET，获取资源会从三个地方获取。首先是本地的_cur_free。因为LocalPool是tls，因此从_cur_free获申请内存时无需加锁
```C++
if (_cur_free.nfree) {                                          \
    BAIDU_OBJECT_POOL_FREE_ITEM_NUM_SUB1;                       \
    return _cur_free.ptrs[--_cur_free.nfree];                   \
}      
```
如果本地_cur_free没有资源了，就从全局的_free_chunks获取新chunk，这里需要加锁
```C++
if (_pool->pop_free_chunk(_cur_free)) {                         \
    BAIDU_OBJECT_POOL_FREE_ITEM_NUM_SUB1;                       \
    return _cur_free.ptrs[--_cur_free.nfree];                   \
}    
```
如果全局也没有资源了，就从本地的_cur_block中获取，此时_cur_block=nullptr，所以需要先add_block并加入全局的group组。
```C++
_cur_block = add_block(&_cur_block_index);                      \
if (_cur_block != NULL) {                                       \
    T* obj = new ((T*)_cur_block->items + _cur_block->nitem) T CTOR_ARGS; \
    if (!ObjectPoolValidator<T>::validate(obj)) {               \
        obj->~T();                                              \
        return NULL;                                            \
    }                                                           \
    ++_cur_block->nitem;                                        \
    return obj;                                                 \
}       
```
但是return_object的时候也没return到block，而是return到了全局的_free_chunks。这里看不懂为什么这么操作
```C++
inline int return_object(T* ptr) {
    // Return to local free list
    if (_cur_free.nfree < ObjectPool::free_chunk_nitem()) {
        _cur_free.ptrs[_cur_free.nfree++] = ptr;
        BAIDU_OBJECT_POOL_FREE_ITEM_NUM_ADD1;
        return 0;
    }
    // Local free list is full, return it to global.
    // For copying issue, check comment in upper get()
    if (_pool->push_free_chunk(_cur_free)) {
        _cur_free.nfree = 1;
        _cur_free.ptrs[0] = ptr;
        BAIDU_OBJECT_POOL_FREE_ITEM_NUM_ADD1;
        return 0;
    }
    return -1;
}
```
### ResourcePool
resourcepool主要用在有资源id标识的地方，比如taskgroup在进行任务偷取的时候，获取的其实是一个id，通过address_meta函数对id进行转换得到真正的内存数据块。所以ResourcePool比ObjectPool多了根据id寻到目标内存块的功能。
```C++
inline butil::ResourceId<TaskMeta> get_slot(bthread_t tid) {
    butil::ResourceId<TaskMeta> id = { (tid & 0xFFFFFFFFul) };
    return id;
}
inline TaskMeta* TaskGroup::address_meta(bthread_t tid) {
    return address_resource(get_slot(tid));
}
```
流程和ObjectPool相似，不同点在于FreeChunk不再直接管理内存而是管理ResourceId
```C++
template <typename T>
struct ResourceId {
    uint64_t value;

    operator uint64_t() const {
        return value;
    }

    template <typename T2>
    ResourceId<T2> cast() const {
        ResourceId<T2> id = { value };
        return id;
    }
};

template <typename T, size_t NITEM> 
struct ResourcePoolFreeChunk {
    size_t nfree;
    ResourceId<T> ids[NITEM];
};
typedef ResourcePoolFreeChunk<T, FREE_CHUNK_NITEM>      FreeChunk;
```
BAIDU_RESOURCE_POOL_GET获取内存资源是首先获取对应的resourceid，再通过unsafe_address_resource获取对应的内存资源
```C++
if (_cur_free.nfree) {                                          \
    const ResourceId<T> free_id = _cur_free.ids[--_cur_free.nfree]; \
    *id = free_id;                                              \
    BAIDU_RESOURCE_POOL_FREE_ITEM_NUM_SUB1;                   \
    return unsafe_address_resource(free_id);                    \
} 
```
unsafe_address_resource就是根据id算出位置，去相应的block group和里面的block取对应内存
```C++
static inline T* unsafe_address_resource(ResourceId<T> id) {
    const size_t block_index = id.value / BLOCK_NITEM;
    return (T*)(_block_groups[(block_index >> RP_GROUP_NBLOCK_NBIT)]
                .load(butil::memory_order_consume)
                ->blocks[(block_index & (RP_GROUP_NBLOCK - 1))]
                .load(butil::memory_order_consume)->items) +
           id.value - block_index * BLOCK_NITEM;
}
```
## 参考
1. [bRPC 学习笔记](https://www.bilibili.com/read/cv16740145/)
2. [bthread官方](http://brpc.incubator.apache.org/zh/docs/bthread/)  
3. [bthread栈创建和切换详解](https://zhuanlan.zhihu.com/p/440031765)
4. [bRPC源码解析·bthread机制](http://brpc.incubator.apache.org/zh/docs/blogs/sourcecodes/bthread/)
5. [从头到尾理解有栈协程实现原理](https://zhuanlan.zhihu.com/p/94018082)
6. [brpc源码解析](https://blog.csdn.net/wxj1992/category_11267957.html)
7. [brpc源码学习](https://blog.csdn.net/kidgin7439/category_10022503.html)
8. [从汇编层面看函数调用的实现原理](https://www.cnblogs.com/abozhang/p/10788396.html)
9. [再谈FreeLockQueue](http://www.aiecent.com/articleDetail?article_id=38)
10. [百度C++工程师的那些极限优化](https://blog.csdn.net/weixin_41055260/article/details/118716132)
11. [bRPC的精华全在bthread上啦](https://zhuanlan.zhihu.com/p/294129746)

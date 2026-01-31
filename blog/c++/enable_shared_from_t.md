# enable_shared_from_this
#### 简介
当类A被share_ptr管理，且在类A的成员函数里需要把当前类对象作为参数传给其他函数时，就需要传递一个指向自身的share_ptr。因为在异步调用中，存在一个保活机制，异步函数执行的时间点我们是无法确定的，然而异步函数可能会使用到异步调用之前就存在的变量。为了保证该变量在异步函数执期间一直有效，我们可以传递一个指向自身的share_ptr给异步函数，这样在异步函数执行期间share_ptr所管理的对象就不会析构，所使用的变量也会一直有效了
当然也可以用std::bind绑定当前成员函数实现相同功能，比如一个asio异步服务器的例子：

```C++
//使用std::bind
psocket->async_write_some(buffer(*pstr),
   boost::bind(&CHelloWorld_Service::write_handler, this, pstr, _1, _2)
   );
   
//使用enable_shared_from_this
class Session : public std::enable_shared_from_this<Session>{
public:
    Session(tcp::socket socket) : socket_(std::move(socket)){
        std::cout << "Session" << std::endl;
    }

    void start(){
        do_read();
    }
    ~Session(){
        std::cout << "~Session" << std::endl;
    }

//asio::buffer类, 用来缓存需要收发的数据, buffer相关的类是asio中功能非常独立的部分
private:
    void do_read()
    {
        auto self(shared_from_this());
        //成员函数, 接收一次数据, 收到多少是多少
        //为什么要捕获this?为了直接调用成员函数do_write和变量data_
        //为什么要捕获self?为了延长对象生命周期
        //断开连接,boost::asio内部会将shared_ptr的引用计数降到0

        //异步监听,当有信息发过来,就调用lambda
        socket_.async_read_some(asio::buffer(data_, max_length),
                                [this, self](std::error_code ec, std::size_t length){
                                    if (!ec){
                                        std::cout<<"self.use_count():"<<self.use_count()<<std::endl;
                                        std::cout<<data_<<std::endl;
                                        do_write(length);
                                    }
                                });
        std::cout<<"async_read_some结束"<<std::endl;
    }

    void do_write(std::size_t length){
        //shared_from_this() 返回一个当前类的std::share_ptr
        auto self(shared_from_this());
        //发送指定字节的数据
        asio::async_write(socket_, asio::buffer(data_, length),
                          [this, self](std::error_code ec, std::size_t /*length*/){
                              if (!ec){
                                  do_read();
                              }
                          });
        std::cout<<"async_write结束 do_write结束"<<std::endl;
    }

    tcp::socket socket_;
    enum { max_length = 1024 };
    char data_[max_length];
};

```





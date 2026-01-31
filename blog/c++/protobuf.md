[TOC]

# Protobuf简单使用
## 简介
Google的序列化工具，跨平台，跨语言。

## proto3与proto2的区别
* 在第一行非空白非注释行，必须写：syntax = “proto3”， 否则默认版本是 proto2;
* 字段规则移除了 “required”，并把 “optional” 改名为 “singular”；
	* 在 proto2 中 required 也是不推荐使用的。proto3 直接从语法层面上移除了 required 规则。
* “repeated” 字段默认采用 packed 编码；
	* 在 proto2 中，需要明确使用packed=true来为字段指定比较紧凑的 packed 编码方式。
* 语言增加 Go、Ruby、JavaNano 支持；
* 移除了 default 选项；
	* 在 proto2 中，可以使用 default 选项为某一字段指定默认值。在 proto3中，字段的默认值只能根据字段类型由系统决定。也就是说，默认值全部是约定好的，而不再提供指定默认值的语法。 在字段被设置为默认值的时候，该字段不会被序列化。这样可以节省空间，提高效率。 但这样就无法区分某字段是根本没赋值，还是赋值了默认值。这在 proto3 中问题不大，但在 proto2 中会有问题。 比如，在更新协议的时候使用 default 选项为某个字段指定了一个与原来不同的默认值，旧代码获取到的该字段的值会与新代码不一样。
	```
	string, 默认值是空字符串（empty string）
	bytes, 默认值是空 bytes（empty bytes）
	bool, 默认值是 false
	numeric, 默认值是 0
	enum, 默认值是第一个枚举值（value 必须为 0）
	repeated，默认值为 empty，通常是一个空 list
	```
* 枚举类型的第一个字段必须为 0 ；
* 移除了对分组的支持；
	* 分组的功能完全可以用消息嵌套的方式来实现，并且更清晰。在 proto2 中已经把分组语法标注为『过期』了。这次也算清理垃圾了。
* proto3 代码在解析新增字段时，会把不认识的字段丢弃，再序列化后新增的字段就没了；
	* 在 proto2 中，旧代码虽然会忽视不认识的新增字段，但并不会将其丢弃，再序列化的时候那些字段会被原样保留。 我觉得还是 proto2 的处理方式更好一些。能尽量保持兼容性和扩展能力，或许实现起来也更简单。proto3 现在的处理方式，没有带来明显的好处，但丢掉了部分兼容性和灵活性。 [2017-06-15 更新]：经过漫长的讨论，官方终于同意在 proto3 中恢复 proto2 的处理方式了。
* 移除了对扩展的支持，新增了 Any 类型；
	* Any 类型是用来替代 proto2 中的扩展的。目前还在开发中。 proto2 中的扩展特性很像 Swift 语言中的扩展。理解起来有点困难，使用起来更是会带来不少混乱。 相比之下，proto3 中新增的 Any 类型有点像 C/C++ 中的 void* ，好理解，使用起来逻辑也更清晰。
* 增加了 JSON 映射特性；

## [proto3规范](https://developers.google.com/protocol-buffers/docs/proto3)
### message
定义一个消息
```
<comment>
message  <message_name> {
  <filed_rule>  <filed_type> <filed_name> = <field_number> 
       规则          类型          名称           编号  
}
//比如：
/* SearchRequest represents a search query, with pagination options to
 * indicate which results to include in the response. */

message SearchRequest {
  string query = 1;
  int32 page_number = 2;  // Which page number do we want?
  int32 result_per_page = 3;  // Number of results to return per page.
}
}
```
#### filed_rule
* singular
	- 默认字段，包含零个或一个字段
* optional
	- 包含零个或一个字段，需要显示的指定默认值
* repeated
	- 数组
* map 
	- map键值对
	```
	message Project {
    int32 age = 1;
    string name = 2;
	}

	message MapData {
	  map<string, Project> projects = 1;
	}
	```
#### filed_type
|				|double	|float	|int32	|int64		|uint32		|uint64		|sint32	|sint64		|fixed32	|fixed64	|sfixed32	|sfixed64		|bool	|string				|bytes|
|-------|-------|-------|-------|---------|---------|---------|-------|---------|---------|---------|---------|-----------|-----|-------------|-----|
|c++		|double	|float	|int32	|int64		|uint32		|uint64		|int32	|int64		|uint32		|uint64		|int32		|int64			|bool	|string				|string|
|python	|float	|float	|int		|int/long	|int/long	|int/long	|int		|int/long	|int/long	|int/long	|int			|int/long		|bool	|str/unicode	|str(Python2)/bytes(Python3)|

#### default value
* For strings, the default value is the empty string.
* For bytes, the default value is empty bytes.
* For bools, the default value is false.
* For numeric types, the default value is zero.
* For enums, the default value is the first defined enum value, which must be 0.
#### Enumerations
```
enum Corpus {
  CORPUS_UNSPECIFIED = 0;
  CORPUS_UNIVERSAL = 1;
  CORPUS_WEB = 2;
  CORPUS_IMAGES = 3;
  CORPUS_LOCAL = 4;
  CORPUS_NEWS = 5;
  CORPUS_PRODUCTS = 6;
  CORPUS_VIDEO = 7;
}
message SearchRequest {
  string query = 1;
  int32 page_number = 2;
  int32 result_per_page = 3;
  Corpus corpus = 4;
}
```
#### reserved
预留值
```
enum Foo {
  UNIVERSAL = 0;
  WEB = 1;
  // IMAGES = 2; //Enum value 'IMAGES' uses reserved number 2
  YOUTUBE = 3; 
  reserved 2, 15, 9 to 11, 40 to max;
  reserved "FOO", "BAR";
}
```
#### oneof
对于网络传输中的一个响应，可能出现不同的结构就可以用oneof。当给oneof多个字段设置时，会按照代码中的初始化顺序，返回最后一个初始化字段的值。
```
message Response {
    Header header = 1;
    oneof payload {
        ArticleResponse articleResponse = 2;
        MusicResponse musicResponse = 3;
    }
}
 
message Header {
    string namespace = 1;
    string name = 2;
    string version = 3;
}
 
message ArticleResponse {
    string title = 1;
    string author = 2;
    string date = 3;
}
 
message MusicResponse {
    string title = 1;
    string author = 2;
    bytes data = 3;
}
```
#### 嵌套message
```
message Result {
  string url = 1;
  string title = 2;
  repeated string snippets = 3;
}
message SearchResponse {
  repeated Result results = 1;
}
or
message SearchResponse {
  message Result {
    string url = 1;
    string title = 2;
    repeated string snippets = 3;
  }
  repeated Result results = 1;
}
or
message SomeOtherMessage {
  SearchResponse.Result result = 1;
}
or
message Outer {                  // Level 0
  message MiddleAA {  // Level 1
    message Inner {   // Level 2
      int64 ival = 1;
      bool  booly = 2;
    }
  }
  message MiddleBB {  // Level 1
    message Inner {   // Level 2
      int32 ival = 1;
      bool  booly = 2;
    }
  }
}
```
#### 应用其他文件定义的message
```
// new.proto
// All definitions are moved here

// old.proto
// This is the proto that all clients are importing.
import public "new.proto";   //注意public产生的影响
import "other.proto";

// client.proto
import "old.proto";
// You use definitions from old.proto and new.proto, but not other.proto
```

### Service
定义一个RPC服务接口
```
option cc_generic_services = true;
message SearchRequest{   
	int64 x = 1;
  int64 y=2;
}
message SearchResponse{
	int64 sum=1;
}
service SearchService {
    //rpc 服务的函数名 （传入参数）返回（返回参数）
    rpc Search (SearchRequest) returns (SearchResponse);
}
```
服务端需要自定义imp类继承SearchService，并重写业务具体内容
```
class SearchServiceImpl : public SearchService
{
 public:
  virtual void Search(::google::protobuf::RpcController* controller,
                       const ::sudoku::SudokuRequest* request,
                       ::sudoku::SudokuResponse* response,
                       ::google::protobuf::Closure* done)
  {
    LOG_INFO << "SearchServiceImpl::SearchSearch";
    response->set_sum(5);
    done->Run();
  }
};
```
向rpc框架注册具体的服务，类似于这样。
```
SearchServiceImpl *impl = new SearchServiceImpl();
RpcServer rpc_server;
rpc_server.RegisterService(impl);
rpc_server.Start();
```
客户端使用stub对象调用函数，注意rpc框架需要实现客户端的RpcChannel::CallMethod
```
RpcChannel channel;
SearchService_Stub client(&channel);
RpcController controller;
FooRequest request,response;
echo_clt.Search(&controller, &request, &response, nullptr);
or
FooResponse *response2 = new FooResponse;
RpcController *controller2 = new RpcController;
echo_clt.Search(&controller, &request, &response, google::protobuf::NewCallback(&AsynicSearchDone, response2, controller2));
```
### proto文件编译
```
protoc -I=$SRC_DIR --cpp_out=$DST_DIR $SRC_DIR/addressbook.proto
```

## 参考
*	[Proto3语法入门](https://www.cnblogs.com/remixnameless/p/15665313.html)
*	[Protobuf 完整解析](http://t.zoukankan.com/zhenghongxin-p-10891426.html)
*	[简单rpc例子](https://github.com/persistentsnail/easy_pb_rpc)
*	[利用protobuf实现RPC框架](https://zhuanlan.zhihu.com/p/373237728)



# 获取类中私有变量

测试用例有时需要获取私有变量以判断值是否正确。所以应该如何获取类的私有变量?

## 侵入式

### public成员函数返回

## 非侵入式

显式实例化模板可以避开权限检查,可以向模板类传类私有变量,再通过模板类返回私有变量值获取,如下。实际编译main中报错:`error: 'int A::data_' is private within this context`,在main中显式调用私有变量不可行

```cpp
class A {
 public:
  A() = default;
 private:
  int __data = 0;
};

template<int A::*Member>
int& GetPrivateData(A& obj) {
  return obj.*Member;
}

template int& GetPrivateData<&A::__data>(A&);

int main() {
  A obj;
  GetPrivateData<&A::__data>(obj);
  return 0;
}
```

### 显式实例化模板+friend

显式实例化模板可以越过权限检查+友元函数访问私有变量

```cpp
class A {
 public:
  A() = default;
 private:
  int __data = 0;
};

typedef int A::* MemPtr;

template<MemPtr memptr>
struct GetPrivateData {
    friend MemPtr steal() {
        return memptr;
    }
};

template struct GetPrivateData<&A::__data>;
MemPtr steal();

int main() {
    A obj;
    auto memptr = steal();
    std::cout<<obj.*memptr<<std::endl;
    obj.*memptr=1;
    std::cout<<obj.*memptr<<std::endl;
  return 0;
}
```

### 显式实例化模板+static

static变量调用也无需实例证对象,所以也能通过static获取私有成员

```cpp
namespace exposer {

template <class MemberType> struct Exposer {
  static MemberType memberPtr;
};
template <class MemberType> MemberType Exposer<MemberType>::memberPtr;

template <class MemberType, MemberType MemberPtr> struct ExposerImpl {
  static struct ExposerFactory {
    ExposerFactory() { Exposer<MemberType>::memberPtr = MemberPtr; }
  } factory;
};
template <class MemberType, MemberType Ptr>
typename ExposerImpl<MemberType, Ptr>::ExposerFactory
    ExposerImpl<MemberType, Ptr>::factory;

} // namespace exposer

#define ACCESS(ClassName, AttrName, AttrType)                                  \
  template struct exposer::ExposerImpl<decltype(&ClassName::AttrName),         \
                                       &ClassName::AttrName>;                  \
  AttrType &get_##AttrName##_from_##ClassName(ClassName &T) {                  \
    return T.*exposer::Exposer<AttrType ClassName::*>::memberPtr;              \
  }

class A {
 public:
  A() = default;
 private:
  int __data = 0;
};

ACCESS(A, __data, int)

int main() {
    A obj;
    std::cout << get___data_from_A(obj);
  return 0;
}
```

## 参考

- https://mp.weixin.qq.com/s/hTKOBFLmwPoBD7_o7QYlRw
- https://zhuanlan.zhihu.com/p/627884224
- https://www.zhihu.com/question/521898260
- https://github.com/HerrCai0907/cpp-private-exposer/blob/main/src/exposer.hpp
- [lackhole/Lupin](https://github.com/lackhole/Lupin)
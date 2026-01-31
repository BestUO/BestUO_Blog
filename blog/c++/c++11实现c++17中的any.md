# c++11实现c++17中的any

[https://www.cnblogs.com/qicosmos/p/3420095.html](https://www.cnblogs.com/qicosmos/p/3420095.html)

```C++
class SimpleAny
{
public:
    SimpleAny(void){}
    template<class T>
    SimpleAny(T &&v){}
private:
    T any;
};
```


以上方法很显然编译通不过的，在创建SimpleAny对象时候T any无法确定。而下面的方法可行，Any类维护了一个Base类，使用BasePtr 延时具体类型的创建。妙啊

```C++
#include <iostream>
#include <string>
#include <memory>
#include <typeindex>

struct Any
{
    Any(void) : m_tpIndex(std::type_index(typeid(void))){}
    Any(const Any& that) : m_ptr(that.Clone()), m_tpIndex(that.m_tpIndex) {}
    Any(Any && that) : m_ptr(std::move(that.m_ptr)), m_tpIndex(that.m_tpIndex) {}

    //创建智能指针时，对于一般的类型，通过std::decay来移除引用和cv符，从而获取原始类型
    template<typename U, class = typename std::enable_if<!std::is_same<typename std::decay<U>::type, Any>::value, U>::type> 
    Any(U && value) : m_ptr(new Derived < typename std::decay<U>::type>(std::forward<U>(value))), m_tpIndex(std::type_index(typeid(typename std::decay<U>::type))){}

    bool IsNull() const { return !bool(m_ptr); }

    template<class U> bool Is() const
    {
        return m_tpIndex == std::type_index(typeid(U));
    }

    //将Any转换为实际的类型
    template<class U>
    U& AnyCast()
    {
        if (!Is<U>())
        {
            std::cout << "can not cast " << typeid(U).name() << " to " << m_tpIndex.name() << std::endl;
            throw std::bad_cast();
        }

        auto derived = dynamic_cast<Derived<U>*> (m_ptr.get());
        return derived->m_value;
    }

    Any& operator=(const Any& a)
    {
        if (m_ptr == a.m_ptr)
            return *this;

        m_ptr = a.Clone();
        m_tpIndex = a.m_tpIndex;
        return *this;
    }

private:
    struct Base;
    typedef std::unique_ptr<Base> BasePtr;

    struct Base
    {
        virtual ~Base() {}
        virtual BasePtr Clone() const = 0;
    };

    template<typename T>
    struct Derived : Base
    {
        template<typename U>
        Derived(U && value) : m_value(std::forward<U>(value)) { }

        BasePtr Clone() const
        {
            return BasePtr(new Derived<T>(m_value));
        }

        T m_value;
    };

    BasePtr Clone() const
    {
        if (m_ptr != nullptr)
            return m_ptr->Clone();

        return nullptr;
    }

    BasePtr m_ptr;
    std::type_index m_tpIndex;
};

void TestAny()
{
    Any n;    
    auto r = n.IsNull();//true
    std::string s1 = "hello";
    n = s1;
    n = "world";
    // n.AnyCast<int>(); //can not cast int to string
    Any n1 = 1;
    n1.Is<int>(); //true
}

int main()
{
    TestAny();
}
```







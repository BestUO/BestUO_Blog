[TOC]

# 707. 设计链表

## 介绍
设计链表的实现。您可以选择使用单链表或双链表。单链表中的节点应该具有两个属性：val 和 next。val 是当前节点的值，next 是指向下一个节点的指针/引用。如果要使用双向链表，则还需要一个属性 prev 以指示链表中的上一个节点。假设链表中的所有节点都是 0-index 的。

在链表类中实现这些功能：

get(index)：获取链表中第 index 个节点的值。如果索引无效，则返回-1。
addAtHead(val)：在链表的第一个元素之前添加一个值为 val 的节点。插入后，新节点将成为链表的第一个节点。
addAtTail(val)：将值为 val 的节点追加到链表的最后一个元素。
addAtIndex(index,val)：在链表中的第 index 个节点之前添加值为 val  的节点。如果 index 等于链表的长度，则该节点将附加到链表的末尾。如果 index 大于链表长度，则不会插入节点。如果index小于0，则在头部插入节点。
deleteAtIndex(index)：如果索引 index 有效，则删除链表中的第 index 个节点。
 

示例：

MyLinkedList linkedList = new MyLinkedList();

linkedList.addAtHead(1);

linkedList.addAtTail(3);

linkedList.addAtIndex(1,2);   //链表变为1-> 2-> 3

linkedList.get(1);            //返回2

linkedList.deleteAtIndex(1);  //现在链表是1-> 3

linkedList.get(1);            //返回3

来源：力扣（LeetCode）
链接：https://leetcode.cn/problems/design-linked-list
著作权归领扣网络所有。商业转载请联系官方授权，非商业转载请注明出处。

## 实现
```python
from functools import lru_cache

class MyLinkedList:
    class Node:
        def __init__(self,value,pre,next):
            self.value = value
            self.pre = pre
            self.next = next
            

    def __init__(self):
        self.__root = self.Node(None,None,None)

    def get(self, index: int) -> int:
        tmp = self.__root
        for i in range (index + 1):
            if tmp.next == None:
                return -1
            else:
                tmp = tmp.next
        return tmp.value


    def addAtHead(self, val: int) -> None:
        nextnode = self.__root.next
        newnode = self.Node(val, self.__root, nextnode)
        if nextnode != None:
            nextnode.pre = newnode
        self.__root.next = newnode


    def addAtTail(self, val: int) -> None:
        tmp = self.__root
        while tmp.next != None:
            tmp = tmp.next
        newnode = self.Node(val, tmp, None)
        tmp.next = newnode

    def addAtIndex(self, index: int, val: int) -> None:
        if(index<=0):
            self.addAtHead(val)
            return

        tmp = self.__root
        for i in range(index+1):
            if tmp.next != None:
                tmp = tmp.next
            else:
                if i == index:
                    self.addAtTail(val)
                    return
                else:
                    return
        prenode = tmp.pre
        nextnode = tmp
        newnode = self.Node(val,prenode,nextnode)
        prenode.next = newnode
        nextnode.pre = newnode

    def deleteAtIndex(self, index: int) -> None:
        tmp = self.__root
        for i in range(index+1):
            if tmp.next != None:
                tmp = tmp.next
            else:
                return
        prenode = tmp.pre
        nextnode = tmp.next
        prenode.next = nextnode
        if(nextnode != None):
            nextnode.pre = prenode
        self.printlist()
    
    def printlist(self):
        p = []
        tmp = self.__root.next
        while tmp != None:
            p += [tmp.value]
            tmp = tmp.next
        print(p)

if __name__ == "__main__":
    linkedList = MyLinkedList()

    funs = ["MyLinkedList","addAtHead","addAtIndex","get"]
    params = [[],[2],[0,1],[1]]

    for fun,param in zip(funs[1:],params[1:]):
        print(getattr(linkedList,fun)(*param))
        linkedList.printlist()
        aaa=0
```
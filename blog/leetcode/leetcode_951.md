[TOC]

# 951. 翻转等价二叉树

## 介绍
我们可以为二叉树 T 定义一个 翻转操作 ，如下所示：选择任意节点，然后交换它的左子树和右子树。

只要经过一定次数的翻转操作后，能使 X 等于 Y，我们就称二叉树 X 翻转 等价 于二叉树 Y。

这些树由根节点 root1 和 root2 给出。如果两个二叉树是否是翻转 等价 的函数，则返回 true ，否则返回 false 。

输入：root1 = [1,2,3,4,5,6,null,null,null,7,8], root2 = [1,3,2,null,6,4,5,null,null,null,null,8,7]
输出：true
解释：我们翻转值为 1，3 以及 5 的三个节点。
示例 2:

输入: root1 = [], root2 = []
输出: true
示例 3:

输入: root1 = [], root2 = [1]
输出: false

来源：力扣（LeetCode）
链接：https://leetcode.cn/problems/flip-equivalent-binary-trees
著作权归领扣网络所有。商业转载请联系官方授权，非商业转载请注明出处。

## 实现
```python
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
class Solution:
    #对所有节点翻转
    def flipEquiv2(self, root1: Optional[TreeNode], root2: Optional[TreeNode]) -> bool:
        def dfs(node):
            if(node != None):
                dfs(node.left)
                dfs(node.right)
                node.left, node.right = node.right, node.left
        dfs(root1)
        return self.binarytree_to_list(root1) == self.binarytree_to_list(root2)

    def flipEquiv(self, root1: Optional[TreeNode], root2: Optional[TreeNode]) -> bool:
        def dfs(root1:TreeNode, root2:TreeNode):
            if(root1 == None and root2 ==None):
                return True
            elif(root1 != None and root2 != None):
                if(root1.val != root2.val):
                    return False
                else:
                    return (dfs(root1.left, root2.left) and dfs(root1.right, root2.right)) or (dfs(root1.left, root2.right) and dfs(root1.right, root2.left))
            else:
                return False
        return dfs(root1, root2)

    def binarytree_to_list(self, root: Optional[TreeNode]):
        l = []
        def dfs(node:TreeNode):
            if(node != None):
                nonlocal l 
                l += [node.val]
                dfs(node.left)
                dfs(node.right)
        dfs(root)
        return l

    def list_to_binarytree(self,nums):
        def level(index):
            if index >= len(nums) or nums[index] is None:
                return None

            root = TreeNode(nums[index])
            root.left = level(2 * index + 1)
            root.right = level(2 * index + 2)
            return root
        return level(0)

if __name__ == "__main__":
    root1 = [1,2,3,4,5,6,None,None,None,7,8]
    root2 = [1,3,2,None,6,4,5,None,None,None,None,None,None,8,7]

    s = Solution()
    root1 = s.list_to_binarytree(root1)
    root2 = s.list_to_binarytree(root2)
    print(s.flipEquiv(root1, root2))
```
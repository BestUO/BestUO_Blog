[TOC]

# 17.19. 消失的两个数字

## 介绍
给定一个数组，包含从 1 到 N 所有的整数，但其中缺了两个数字。你能在 O(N) 时间内只用 O(1) 的空间找到它们吗？

以任意顺序返回这两个数字均可。

示例 1:

输入: [1]
输出: [2,3]
示例 2:

输入: [2,3]
输出: [1,4]

来源：力扣（LeetCode）
链接：https://leetcode.cn/problems/missing-two-lcci
著作权归领扣网络所有。商业转载请联系官方授权，非商业转载请注明出处。

## 实现
```python
from typing import List
class Solution:
    def missingTwo(self, nums: List[int]) -> List[int]:
        squaresum = sum(x**2 for x in nums)
        listsum = sum(nums)
        maxnum = max(nums)
        maxnumsquaresum = sum(x**2 for x in range(maxnum+1))
        maxnumsum = sum(x for x in range(maxnum+1))
        if(maxnumsquaresum == squaresum):#[1,2,3]
            return [maxnum+1,maxnum+2]
        if(maxnumsquaresum > squaresum):    #[1,3] :
            x = maxnumsquaresum - squaresum # 2**2
            if pow(x,0.5).is_integer() and x < maxnum**2:
                return [int(pow(x,0.5)),maxnum+1]
            else:                               #[1,4]
                x = maxnumsquaresum - squaresum # a**2 + b**2 = x
                y = maxnumsum - listsum         # a + b = y
                i = y**2-x                      #2ab = i
                j = int(pow(x-i,0.5))            # a - b
                return [int((y+j)/2),int((y-j)/2)]

class Solution2:
    def missingTwo(self, nums: List[int]) -> List[int]:
        n = len(nums) + 2
        cur = n * (1 + n) // 2 - sum(nums)
        tot, t = cur, cur // 2
        cur = t * (1 + t) // 2 - sum([x for x in nums if x <= t])
        return [cur, tot - cur]
'''
作者：AC_OIer
链接：https://leetcode.cn/problems/missing-two-lcci/solution/by-ac_oier-pgeh/
来源：力扣（LeetCode）
著作权归作者所有。商业转载请联系作者获得授权，非商业转载请注明出处。
'''

if __name__ == "__main__":
    s1 = [1, 2, 3, 4, 5, 7, 9, 10]

    s = Solution()
    print(s.missingTwo(s1))
```
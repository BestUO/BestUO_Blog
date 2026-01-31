[TOC]

# 17.09. 第 k 个数

## 介绍
有些数他的因子只有 3，5，7中的一个或者多个，请设计一个算法找出第 k 个数。例如，前几个数按顺序应该是 1，3，5，7，9，15，21。

示例 1:

输入: k = 5

输出: 9

来源：力扣（LeetCode）
链接：https://leetcode.cn/problems/get-kth-magic-number-lcci
著作权归领扣网络所有。商业转载请联系官方授权，非商业转载请注明出处。

## 实现
```python
from functools import lru_cache
from typing import List
import time 
class Solution:
    def getKthMagicNumber(self, k: int) -> int:
        dp = [0] * (k + 1)
        dp[1] = 1
        p3 = p5 = p7 = 1

        for i in range(2, k + 1):
            num3, num5, num7 = dp[p3] * 3, dp[p5] * 5, dp[p7] * 7
            dp[i] = min(num3, num5, num7)
            if dp[i] == num3:
                p3 += 1
            if dp[i] == num5:
                p5 += 1
            if dp[i] == num7:
                p7 += 1
        
        return dp[k]
'''
作者：LeetCode-Solution
链接：https://leetcode.cn/problems/get-kth-magic-number-lcci/solution/di-k-ge-shu-by-leetcode-solution-vzp7/
来源：力扣（LeetCode）
著作权归作者所有。商业转载请联系作者获得授权，非商业转载请注明出处。
'''


if __name__ == "__main__":
    k = 300
   
    s = Solution()
    time_start = time.time()
    print(s.getKthMagicNumber(k))
    end_start = time.time()
    print('time cost', end_start-time_start, 's')
```
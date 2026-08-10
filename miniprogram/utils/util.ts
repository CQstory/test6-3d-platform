import { PriceMatrix } from '../types/model'

export const formatTime = (date: Date) => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return (
    [year, month, day].map(formatNumber).join('/') +
    ' ' +
    [hour, minute, second].map(formatNumber).join(':')
  )
}

/** 图片加载失败时的兜底占位（1x1 透明 PNG，露出容器背景色） */
export const FALLBACK_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const formatNumber = (n: number) => {
  const s = n.toString()
  return s[1] ? s : '0' + s
}

/** 价格展示文本：单价优先；无单价时取价格矩阵最低值（带「起」）；无价格返回空串 */
export function formatPriceText(price: number, priceMatrix: PriceMatrix | null): string {
  if (price > 0) return '¥' + price
  const pm = priceMatrix
  if (pm && pm.prices) {
    const vals: number[] = []
    Object.keys(pm.prices).forEach(k => {
      const v = pm.prices[k]
      if (v > 0) vals.push(v)
    })
    if (vals.length > 0) {
      const min = vals.reduce((a, b) => Math.min(a, b))
      return '¥' + min + ' 起'
    }
  }
  return ''
}

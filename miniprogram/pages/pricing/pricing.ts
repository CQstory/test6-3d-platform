import { Plan } from '../../types/model'
import { plansData } from '../../data/plans'

Page({
  data: {
    plans: plansData as Plan[],
  },
})

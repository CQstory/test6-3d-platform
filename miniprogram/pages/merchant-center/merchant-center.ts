import { userService } from '../../services/user-service'

Page({
  data: { role: '' },
  onLoad() {
    const user = userService.getCurrentUser()
    this.setData({ role: user ? user.role : 'user' })
  },
})

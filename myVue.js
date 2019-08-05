/**
 * 订阅发布 调度中心
 */
class Dep {
  constructor() {
    this.subs = [] // 存放所有的watcher
  }
  // 添加watcher， 订阅
  addSub(watcher) {
    this.subs.push(watcher)
  }
  // 发布
  notify() {
    this.subs.forEach(watcher => watcher.update())
  }
}

/**
 *  观察者模式 观察者，被观察者
 */
class Watcher {
  constructor(vm, expr, cb) {
    this.vm = vm
    this.expr = expr
    this.cb = cb

    // 默认先存放旧值
    this.oldValue = this.get(vm, expr)
  }
  // 获取旧的值
  get() {
    Dep.target = this
    let value = CompileUtil.getVal(this.vm, this.expr)
    Dep.target = null
    return value
  }
  // 数据更新
  update() {
    let newVal = CompileUtil.getVal(this.vm, this.expr)
    if(newVal != this.oldValue) {
      this.cb(newVal)
    }
  }
}

/**
 * 实现数据劫持
 */
class Observer {
  constructor(data) {
    this.observe(data)
  }
  observe(data) {
    if(data && typeof data == 'object') {
      for(let key in data) {
        this.defineReactive(data, key, data[key])
      }
    }
  }

  defineReactive(obj, key, value) {
    this.observe(value)
    let dep = new Dep() // 给每一个属性都加上一个具有发布订阅的功能
    Object.defineProperty(obj, key, {
      get() {
        Dep.target && dep.addSub(Dep.target)
        return value
      },
      set: (newValue) => {
        if(newValue != value) {
          this.observe(newValue)
          value = newValue
          dep.notify()
        }
      }
    })
  }
}

/**
 * 编译模板
 */
class Compiler {
  constructor(el, vm) {
    this.vm = vm
    // 判断el是否是个元素，如果不是就获取它
    this.el = this.isElementNode(el) ? el : document.querySelector(el)
    // console.log(this.el)
    // 把当前节点中的元素放到内存中
    let fragment = this.node2fragment(this.el)
    
    // 把节点中的内容进行替换

    // 编译模板 用数据来编译
    this.compile(fragment)

    // 把内容再塞回页面中
    this.el.appendChild(fragment)
  }

  // 是否是指令 v-开头的
  isDirective(attrName) {
    // startsWith('v-') 或 split('-')
    return attrName.indexOf('v-') !== -1
  }
  // 编译元素
  compileElement(node) {
    let attributes = node.attributes
    // [...attributes] 或 Array.from 等价 Array.prototype.slice.call
    Array.from(attributes).forEach(attr => {
      let { name, value: expr } = attr
      if(this.isDirective(name)) {
        // 
        let [, directive] = name.split('-')
        // console.log(name,node, expr, directive)
        if(directive.indexOf(':' !== -1)) {
          let [directiveName, eventName] = directive.split(':')
          CompileUtil[directiveName](node, expr, this.vm, eventName)
        } else {
          CompileUtil[directive](node, expr, this.vm)
        }
        
      }
    })
  }
  // 编译文本 找{{}}
  compileText(node) {
    let content = node.textContent
    if(/\{\{(.+?)\}\}/.test(content)) {
      // console.log(content) // 找到所有文本
      CompileUtil['text'](node, content, this.vm)
    }
  }

  // 编译内存中的dom节点 核心的编译方法
  compile(node) {
    let childNodes = node.childNodes
    Array.from(childNodes).forEach(child => {
      if(this.isElementNode(child)) {
        this.compileElement(child)
        // 如果是元素的话，需要除去自己，再去遍历子节点
        this.compile(child)
      } else {
        this.compileText(child)
      }
    })
  }
  // 把节点移动到内存中 appendChild方法
  node2fragment(node) {
    let fragment = document.createDocumentFragment()
    let firstChild
    while(firstChild = node.firstChild) {
      fragment.appendChild(firstChild)
    }

    return fragment
  }
  // 判断是否为元素节点
  isElementNode(node) {
    return node.nodeType === 1
  }
}

/**
 * 编译工具函数
 */
CompileUtil = {
  // 根据表达式取对应的数据
  getVal(vm, expr) {
    return expr.split('.').reduce((data, current) => {
      return data[current]
    }, vm.$data)
  },
  getContentVal(vm, expr) {
    return expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      return this.getVal(vm, args[1])
    })
  },
  setVal(vm, expr, value) {
    expr.split('.').reduce((data, current, index, arr) => {
      if(index === arr.length - 1) {
        return data[current] = value
      }
      return data[current]
    }, vm.$data)
  },
  // 解析v-model指令
  model(node, expr, vm) {
    // node.value
    let fn = this.updater['modelUpdater']
    new Watcher(vm, expr, (newVal) => { // 给输入框加一个观察者，稍后数据更新，触发此方法，用新值给输入框赋值
      fn(node, newVal)
    })
    node.addEventListener('input', e => {
      let value = e.target.value
      this.setVal(vm, expr, value)
    })
    let value = this.getVal(vm, expr)
    fn(node, value)
  },
  on(node, expr, vm, eventName) {
    node.addEventListener(eventName, e => {
      vm[expr].call(vm, e)
    })
  },
  text(node, expr, vm) {
    let fn = this.updater['textUpdater']
    let content = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      // 给表达式每个变量都加上观察者
      new Watcher(vm, args[1], () => {
        fn(node, this.getContentVal(vm, expr)) // 返回一个全的字符串
      })
      return this.getVal(vm, args[1])
    })
    fn(node, content)
  },
  html(node, expr, vm) {
    // node.innerHTML
    let fn = this.updater['htmlUpdater']
    new Watcher(vm, expr, (newVal) => { // 给输入框加一个观察者，稍后数据更新，触发此方法，用新值给输入框赋值
      fn(node, newVal)
    })
    let value = this.getVal(vm, expr)
    fn(node, value)

  },
  updater: {
    modelUpdater(node, value) {
      node.value = value
    },
    textUpdater(node, value) {
      node.textContent = value
    },
    htmlUpdater(node, value) {
      node.innerHTML = value
    }
  }
}

/**
 * Vue构造函数
 */
class Vue {
  constructor(options) {
    this.$el = options.el
    this.$data = options.data

    let computed = options.computed
    let methods = options.methods

    if(this.$el) {
      //  做数据劫持
      new Observer(this.$data)
      // console.log(this.$data)

      for(let key in computed) { // 依赖关系
        Object.defineProperty(this.$data, key, {
          get: () => {
            return computed[key].call(this)
          }
        })
      }

      for(let key in methods) {
        Object.defineProperty(this, key, {
          get() {
            return methods[key]
          }
        })
      }

      // vm上的取值操作都代理上vm.$data上
      this.proxyVm(this.$data)

      // 编译模板
      new Compiler(this.$el, this)
    }
  }
  // 代理
  proxyVm(data) {
    for(let key in data) {
      Object.defineProperty(this, key, {
        get() {
          return data[key]
        },
        set(newVal) {
          data[key] = newVal
        }
      })
    }
  }
}

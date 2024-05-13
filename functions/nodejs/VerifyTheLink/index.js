// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
  // 日志功能
  // logger.info(`${new Date()} 函数开始执行`);

  // 在这里补充业务代码

  if(!params.object_chat_menu_catalog){
    logger.error("传入的群菜单分类为空")
  }

  const data = 1;
  //查询分类
  console.info(object_chat_menu_catalog)
  //查询一级菜单
  const object_chat_menu = await application.data.object('object_chat_menu').select('_id','menu_link','level_count','name').where({"menu_catalog":params.object_chat_menu_catalog}).find()

  object_chat_menu.array.forEach(element => {
          //判断二级菜单数量===0
  if(element.level_count===0){
    //判断一级菜单链接是否为空
    if(!element.menu_link){
      // logger.error(element.name+"菜单的链接与二级菜单能同时为空！")
      data = 0
    }
  }
  });
  return {data}

}
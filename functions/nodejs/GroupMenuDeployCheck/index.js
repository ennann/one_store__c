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
    logger.info(`${new Date()} 函数开始执行`);

    // 在这里补充业务代码

    const {object_chat_menu_catalog} = params;
    const response = {
        code: true,
        message: "校验通过"
    }
    logger.info("入参--->", object_chat_menu_catalog)
    if (!object_chat_menu_catalog) {
        response.code = false;
        response.message = "校验失败：缺少必须参数！"
        logger.error("校验失败：缺少必须参数--->", object_chat_menu_catalog)
        return response;
    }
    await application.data.object('object_chat_menu')
        .select(['_id', 'menu_link', 'level_count','parent_menu','name'])
        .where({menu_catalog: {_id: object_chat_menu_catalog._id},parent_menu: null})
        .findStream(async objectChatMenus => {
            logger.info("群菜单校验记录列表--->", objectChatMenus)
            objectChatMenus.forEach(objectChatMenu =>{
                logger.info("群菜单校验记录详情--->", objectChatMenu)
                if (objectChatMenu.level_count === 0 && ((""+objectChatMenu.menu_link).toString().trim() === "" || objectChatMenu.menu_link === null)) {
                    response.code = false;
                    response.message = "校验失败：存在一级菜单无二级菜单且无默认链接--->" + objectChatMenu.name;
                    logger.error("校验失败：存在一级菜单无二级菜单且无默认链接--->"+ objectChatMenu.name);
                }
            })
        });
    return response;
}

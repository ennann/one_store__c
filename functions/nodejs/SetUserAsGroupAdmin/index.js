// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const { newLarkClient } = require('../utils');
const { getUserIdByEmails,getOpenIdByEmailsOrMobiles } = require("../utils");
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
    const { object_feishu_chat } = params;
    const chat_id = object_feishu_chat.chat_id;
    const chat_managers = object_feishu_chat.chat_managers;
    const users = [];
    const res = {
        code : 0,
        message:"群管理员设置成功"
    }
    logger.info("params--->" + JSON.stringify(params, null, 2));
    if(!object_feishu_chat){
        res.code = -1
        res.message = "缺少必须参数"
        return res
    }
    if(!chat_id){
        res.code = -1
        res.message = "缺少必须参数：chat_id"
        logger.error(res);
        return res
    }
    logger.info("群管理员信息--->" + JSON.stringify(chat_managers, null, 2));
    if(!chat_managers){
        res.code = -1
        res.message = "缺少必须参数：群管理员人员记录"
        logger.error(res);
        return res
    }
    try{
        const emails = []
        const mobiles = []
        chat_managers.forEach(element => {
            emails.push(element._email);
        });
        //获取open_id
        // const open_ids = await getOpenIdByEmailsOrMobiles({emails: emails},{mobiles:mobiles},logger)
        const userIdList = await getUserIdByEmails(emails, logger)
        logger.info("userIdList--->" + JSON.stringify(userIdList, null, 2));
        //设置管理员
        await faas.function('CreateChatAdmin').invoke({chat_id: chat_id, open_ids: userIdList});
        logger.info(res);
        return res
    }catch(e){
        res.code = -1
        res.message = e
        logger.error(res);
        return res
    }
}

// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const { newLarkClient, getUserIdByEmails } = require('../utils');


/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function(params, context, logger) {

    logger.info("函数开始执行");
    logger.info({ timestamp: new Date(), user: context.user._id });

    let response = {
        code: 0,
        message: ""
    };

    const client = await newLarkClient({ userId: context.user._id }, logger);

    let emails = params.emails;
    let chat_id = params.chat_id;

    // 检查 emails 是否为有效数组
    if (!Array.isArray(emails) || emails.length === 0) {
        logger.error("未提供有效的 emails 数组");
        response.code = -1;
        response.message = "未提供有效的 emails 数组或数组为空";
        return response;
    }

    // 检查 chat_id 是否提供
    if (!chat_id || chat_id.length == 0) {
        logger.error("未提供 chat_id");
        response.code = -1;
        response.message = "未提供 chat_id";
        return response;
    }

    // 获取用户信息
    try {

        const id_list = await getUserIdByEmails(emails, logger)
        logger.info("提取的用户ID列表", { id_list });
        if (id_list.length == 0) {
            response.code = -1;
            response.message = "移除群成员失败，请确认权限";
            return response;
        }
        logger.info("提取的用户ID列表", { id_list });

        let add_menger_res = await client.im.chatMembers.delete({
            path: { chat_id },
            params: { member_id_type: 'user_id' },
            data: { id_list }
        });

        if (add_menger_res.code !== 0) {
            response.code = res.code;
            response.message = "移除群成员失败: " + add_menger_res.msg;
            return response;
        }

        response.message = "群成员移除成功";
    } catch (error) {
        logger.error("操作过程中发生错误", error);
        response.code = -1;
        response.message = "操作过程中发生错误: " + error.message;
        return response;
    }

    return response;
}
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
    logger.info(params);  // 记录传入参数

    let response = {
        code: 0,
        message: ""
    };

    // 检查传入的group对象是否存在
    if (!params.group || !params.group.store || params.group.chat_id) {
        response.code = -1;
        response.message = "缺少群组数据，请确保数据完整";
        return response;
    }

    const group = params.group;

    try {
        // 查找门店记录
        let store_record = await application.data.object('object_store').select('_id', 'store_department').where({ 'store_code': group.store }).findOne();
        logger.info("门店 aPaaS 记录", store_record);

        if (!store_record) {
            response.code = -1;
            response.message = "门店编号无效，未找到相应的门店记录";
            return response;
        }

        // 替换group中的store属性
        group.store = store_record;
        group.department = store_record.store_department;

        // 创建群
        let result = await application.data.object("object_feishu_chat").create(group);
        response.message = "创建群聊记录成功";
        response.data = result;

    } catch (e) {
        logger.error("创建群组时发生错误", e);
        response.code = -1;
        response.message = "创建门店记录时发生错误，请联系管理员查看日志";
    }

    return response;
}
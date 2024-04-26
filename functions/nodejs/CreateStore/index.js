// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const { getaPaaSUser, batchOperation } = require('../utils');


/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function(params, context, logger) {
    // 日志功能
    // logger.info(`${new Date()} 函数开始执行`);

    // 在这里补充业务代码
    logger.info(params);

    let response = {
        "code": 0,
        "message": ""
    }


    // 确保传入了有效的 store 严格的筛选条件 || !params.store.store_manager || !params.store.store_department || !params.store.store_region
    if (!params.store) {
        response.code = -1;
        response.message = "缺少必要的门店数据";
        return response;
    }


    try {

        const { store_manager, store_department, store_region } = params.store;

        let manager_record = await getaPaaSUser({email: store_manager});
        logger.info("门店负责人 aPaaS 记录", manager_record);

        let department_record = await application.data.object('_department').select('_id', '_name').where({'_name': store_department}).findOne();
        logger.info("部门 aPaaS 记录", department_record);

        let region_record = await application.data.object('_region').select('_id', '_name').where({'_name': store_region}).findOne();
        logger.info("区域 aPaaS 记录", region_record);

        // 构造门店数据
        let new_store = {
            ...params.store,
            store_department: { _id: department_record?._id },
            store_manager: { _id: manager_record?._id },
            store_region: { _id: region_record?._id }
        };

        // 创建门店
        let result = await application.data.object("object_store").create(new_store);
        response.message = "创建门店记录成功";
        response.data = result;


    } catch (e) {
        logger.error("创建门店记录时发生错误", e);
        response.code = -1;
        response.message = "创建门店记录时发生错误，请联系管理员查看日志";
    }

    return response;

}
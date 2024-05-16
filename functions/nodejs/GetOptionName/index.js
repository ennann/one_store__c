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
    const { table_name,option_type,option_api} = params;
    try {
        const storeTaskPriorityDefine = await application.metadata.object(table_name).getField(option_type);
        console.info(storeTaskPriorityDefine)
        let priorityName = storeTaskPriorityDefine.optionList.find(item => item.apiName === option_api).label.find(item => item.language_code === 2052).text;
        return {code: 0,option_name: priorityName}
    }catch (error){
        return {code:-1,option_name: "参数有误"}
    }
}

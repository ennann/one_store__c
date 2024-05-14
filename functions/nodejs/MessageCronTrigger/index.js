// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
const dayjs = require('dayjs');
const _ = application.operator;

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    logger.info(`${new Date()} 消息触发器函数开始执行`);

    const currentTime = dayjs().valueOf(); // 当前时间
    logger.info('当前时间->', currentTime, dayjs(currentTime).format('YYYY-MM-DD HH:mm:ss'));

    // 查询所有的消息定义数据
    let messageDefineRecords = await application.data
        .object('object_chat_message_def')
        .select(
            '_id',
            'title',
            'chat_rule',
            'user_rule',
            'option_method',
            'option_time_cycle',
            'repetition_rate',
            'datetime_start',
            'datetime_end',
            'boolean_public_now',
            'datetime_publish', // 发布时间
            'option_status', // 等于 option_enable
        )
        .where(
            _.or(
                _.and({
                    option_status: 'option_enable',
                    option_method: 'option_cycle',
                    datetime_start: _.lte(currentTime),
                    datetime_end: _.gte(currentTime),
                }), // 周期消息的条件
                _.and({
                    option_status: 'option_enable',
                    option_method: 'option_once',
                    boolean_public_now: false,
                    datetime_publish: _.lte(currentTime + 1000 * 60 * 5), // 5分钟内的消息
                    datetime_publish: _.gte(currentTime - 1000 * 60 * 5),
                }), // 一次性消息的条件
            ),
        )
        .find();

    logger.info('查询到的消息定义数量->', messageDefineRecords.length);
    logger.info(messageDefineRecords);


    // 根据消息定义判断是否需要调用消息生成函数


    // 第一种：一次性消息
    // 消息定义中的 option_method 为 option_once，并且 boolean_public_now 为 false
    let valuedOnceMessageDefineList = messageDefineRecords.filter(item => item.option_method === 'option_once' && item.boolean_public_now === false);
    logger.info('需要触发的一次性消息定义数量->', valuedOnceMessageDefineList.length);

    // 第二种：周期消息
    // 消息定义中的 option_method 为 option_cycle
    let valuedCycleMessageDefineList = [];
    let cycleMessageDefineList = messageDefineRecords.filter(item => item.option_method === 'option_cycle');
    for (let i = 0; i < cycleMessageDefineList.length; i++) {
        let cycleMessageDefine = cycleMessageDefineList[i];
        // 获取到 cycleMessageDefine 的 datetime_start 时间，但是仅仅获取到小时和分钟，日期部分修改为当天的日期
        let hourMinute = dayjs(cycleMessageDefine.datetime_start).format('HH:mm');
        let triggerTime = dayjs(`${dayjs().format('YYYY-MM-DD')} ${hourMinute}`).valueOf();
        // 如果 currentTime 在 triggerTime +- 5分钟内，那么就是需要触发的周期消息
        if (currentTime >= triggerTime - 1000 * 60 * 5 && currentTime <= triggerTime + 1000 * 60 * 5) {
            valuedCycleMessageDefineList.push(cycleMessageDefine);
        }
    }
    logger.info('需要触发的周期消息定义数量->', valuedCycleMessageDefineList.length);


    const valuedMessageDefineList = valuedOnceMessageDefineList.concat(valuedCycleMessageDefineList);
    logger.info('✅ 需要触发的消息定义总数量->', valuedMessageDefineList.length);
    return valuedMessageDefineList;


    // 创建一个函数，用于调用消息生成函数，最后使用 Promise.all 来并发执行 valuedMessageDefineList 内的消息定义
    const invokeMessageGenerateFunction = async messageDefine => {
        // 调用消息生成函数
        const messageGenerateFunction = faas.function('TimedGenerationMessage').invoke(messageDefine);
        return messageGenerateFunction;
    };

    // 并发执行消息生成函数
    let messageGenerationResult = await Promise.all(valuedMessageDefineList.map(invokeMessageGenerateFunction));
    logger.info('消息生成函数执行结果->', messageGenerationResult);

    let successList = messageGenerationResult.filter(item => item.code == 0);
    let failList = messageGenerationResult.filter(item => item.code != 0);

    return {
        message: '消息触发器函数执行成功',
        successList,
        failList,
    };
};

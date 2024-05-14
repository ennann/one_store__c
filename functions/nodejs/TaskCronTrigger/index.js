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
    logger.info(`${new Date()} 任务触发器函数开始执行`);

    const currentTime = dayjs().valueOf(); // 当前时间
    logger.info('当前时间->', currentTime, dayjs(currentTime).format('YYYY-MM-DD HH:mm:ss'));

    // 查询所有的任务定义数据
    let taskDefineRecords = await application.data
        .object('object_task_def')
        .select(
            '_id',
            'name',
            'description',
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
                }), // 周期任务的条件
                _.and({
                    option_status: 'option_enable',
                    option_method: 'option_once',
                    boolean_public_now: false,
                    datetime_publish: _.lte(currentTime + 1000 * 60 * 5), // 5分钟内的任务
                    datetime_publish: _.gte(currentTime - 1000 * 60 * 5),
                }), // 一次性任务的条件
            ),
        )
        .find();

    logger.info('查询到的任务定义数量->', taskDefineRecords.length);
    logger.info(taskDefineRecords);

    // 根据任务定义判断是否需要调用任务生成函数

    
    // 第一种：一次性任务
    // 任务定义中的 option_method 为 option_once，并且 boolean_public_now 为 false
    let valuedOnceTaskDefineList = taskDefineRecords.filter(
        (item) => item.option_method === 'option_once' && item.boolean_public_now === false,
    );
    logger.info('需要触发的一次性任务定义数量->', valuedOnceTaskDefineList.length);


    // 第二种：周期任务
    // 任务定义中的 option_method 为 option_cycle
    let valuedCycleTaskDefineList = [];
    let cycleTaskDefineList = taskDefineRecords.filter((item) => item.option_method === 'option_cycle');
    for (let i = 0; i < cycleTaskDefineList.length; i++) {
        let cycleTaskDefine = cycleTaskDefineList[i];
        // 获取到 cycleTaskDefine 的 datetime_start 时间，但是仅仅获取到小时和分钟，日期部分修改为当天的日期
        let hourMinute = dayjs(cycleTaskDefine.datetime_start).format('HH:mm');
        let triggerTime = dayjs(`${dayjs().format('YYYY-MM-DD')} ${hourMinute}`).valueOf();
        // 如果 currentTime 在 triggerTime +- 5分钟内，那么就是需要触发的周期任务
        if (currentTime >= triggerTime - 1000 * 60 * 5 && currentTime <= triggerTime + 1000 * 60 * 5) {
            valuedCycleTaskDefineList.push(cycleTaskDefine);
        }
    }
    logger.info('需要触发的周期任务定义数量->', valuedCycleTaskDefineList.length);

    const valuedTaskDefineList = valuedOnceTaskDefineList.concat(valuedCycleTaskDefineList);

    logger.info('✅ 需要触发的周期任务定义总数量->', valuedTaskDefineList.length);
    logger.info(valuedTaskDefineList);
    return valuedTaskDefineList;

    // 创建一个函数，用于调用任务生成函数，最后使用 Promise.all 来并发执行 valuedTaskDefineList 内的任务定义
    const invokeTaskGenerateFunction = async (taskDefine) => {
        // 调用任务生成函数
        const taskGenerateFunction = faas.function('TimedGenerationTask').invoke(taskDefine);
        return taskGenerateFunction;
    };

    // 并发执行任务生成函数
    let taskGenerationResult = await Promise.all(valuedTaskDefineList.map(invokeTaskGenerateFunction));
    logger.info('任务生成函数执行结果->', taskGenerationResult);

    let successList = taskGenerationResult.filter((item) => item.code == 0);
    let failList = taskGenerationResult.filter((item) => item.code != 0);

    return {
        message: '任务触发器函数执行成功',
        successList,
        failList,
    };

    
};

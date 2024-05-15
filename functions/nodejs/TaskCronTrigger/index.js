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

    const currentTime = dayjs().add(8, 'hour').valueOf(); // 当前时间
    const timeBuffer = 1000 * 60 * 5; // 5 minutes buffer
    logger.info('当前时间->', currentTime, dayjs(currentTime).format('YYYY-MM-DD HH:mm:ss'));

    // 查询所有的任务定义数据
    const taskDefineRecords = await application.data
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
            'option_status' // 等于 option_enable
        )
        .where(
            _.or(
                _.and({
                    option_status: 'option_enable',
                    option_method: 'option_cycle',
                    datetime_start: _.lte(currentTime),
                    datetime_end: _.gte(currentTime)
                }), // 周期任务的条件
                _.and({
                    option_status: 'option_enable',
                    option_method: 'option_once',
                    boolean_public_now: false,
                    datetime_publish: _.lte(currentTime + timeBuffer), // 5分钟内的任务
                    datetime_publish: _.gte(currentTime - timeBuffer)
                }) // 一次性任务的条件
            )
        )
        .find();

    logger.info('查询到的任务定义数量->', taskDefineRecords.length);
    logger.info(taskDefineRecords);

    // 根据任务定义判断是否需要调用任务生成函数

    // 一次性任务
    const valuedOnceTaskDefineList = taskDefineRecords.filter(item => item.option_method === 'option_once' && item.boolean_public_now === false);
    logger.info('需要触发的一次性任务定义数量->', valuedOnceTaskDefineList.length);

    // 周期任务
    const calculateTriggerTime = (startTime, repetitionRate, unit) => {
        return dayjs(startTime).add(repetitionRate, unit).valueOf();
    };

    const valuedCycleTaskDefineList = taskDefineRecords.filter(item => item.option_method === 'option_cycle').filter(cycleTaskDefine => {
        const { datetime_start: startTime, option_time_cycle: cycleType, repetition_rate: repetitionRate } = cycleTaskDefine;
        const unitMapping = {
            'option_day': 'day',
            'option_week': 'week',
            'option_month': 'month',
            'option_quarter': { unit: 'month', factor: 3 },
            'option_half_year': { unit: 'month', factor: 6 },
            'option_year': 'year'
        };

        const { unit, factor = 1 } = typeof unitMapping[cycleType] === 'string' ? { unit: unitMapping[cycleType] } : unitMapping[cycleType];
        const triggerTime = calculateTriggerTime(startTime, repetitionRate * factor, unit);

        return triggerTime && currentTime >= triggerTime - timeBuffer && currentTime <= triggerTime + timeBuffer;
    });

    logger.info('需要触发的周期任务定义数量->', valuedCycleTaskDefineList.length);

    const valuedTaskDefineList = [...valuedOnceTaskDefineList, ...valuedCycleTaskDefineList];
    logger.info('✅ 需要触发的任务定义总数量->', valuedTaskDefineList.length);
    return valuedTaskDefineList

    // 创建一个函数，用于调用任务生成函数，最后使用 Promise.all 来并发执行 valuedTaskDefineList 内的任务定义
    const invokeTaskGenerateFunction = async taskDefine => {
        // 调用任务生成函数
        return faas.function('TimedGenerationTask').invoke(taskDefine);
    };

    // 并发执行任务生成函数
    const taskGenerationResult = await Promise.all(valuedTaskDefineList.map(invokeTaskGenerateFunction));
    logger.info('任务生成函数执行结果->', taskGenerationResult);

    const successList = taskGenerationResult.filter(item => item.code === 0);
    const failList = taskGenerationResult.filter(item => item.code !== 0);

    return {
        message: '任务触发器函数执行成功',
        successList,
        failList
    };
};

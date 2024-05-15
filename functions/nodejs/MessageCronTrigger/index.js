<<<<<<< HEAD
// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
=======
>>>>>>> 5ef7959 (增加关键触发器函数)
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

<<<<<<< HEAD
    const currentTime = dayjs().valueOf(); // 当前时间，东八区时间
    const timeBuffer = 1000 * 60 * 60; // 5 minutes buffer
    logger.info('当前时间->', currentTime, dayjs(currentTime).format('YYYY-MM-DD HH:mm:ss'));
=======
    const currentDate = dayjs().format('YYYY-MM-DD');
    const currentTime = dayjs().valueOf(); // 当前时间
    const timeBuffer = 1000 * 60 * 5; // 5 minutes buffer
    logger.info('当前时间->', currentDate, currentTime, dayjs(currentTime).format('YYYY-MM-DD HH:mm:ss'));
>>>>>>> 5ef7959 (增加关键触发器函数)

    // 查询所有的消息定义数据
    const messageDefineRecords = await application.data
        .object('object_chat_message_def')
        .select(
            '_id',
            'title',
            'option_method',
            'option_time_cycle', // 天、周、月、季度、年
            'repetition_rate', // 重复频次
            'datetime_start', // 重复任务开始时间
            'datetime_end', // 重复任务结束时间
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
                }), // 周期消息的条件
                _.and({
                    option_status: 'option_enable',
                    option_method: 'option_once',
                    boolean_public_now: false,
                    datetime_publish: _.lte(currentTime + timeBuffer), // 5分钟内的消息
<<<<<<< HEAD
                    datetime_publish: _.gte(currentTime - timeBuffer)
                }) // 一次性消息的条件
            )
=======
                    datetime_publish: _.gte(currentTime - timeBuffer),
                }), // 一次性消息的条件
            ),
>>>>>>> 5ef7959 (增加关键触发器函数)
        )
        .find();

    logger.info('查询到的消息定义数量->', messageDefineRecords.length);
    logger.info(messageDefineRecords);

<<<<<<< HEAD
    // 一次性任务
    const valuedOnceMessageDefineList = messageDefineRecords.filter(item => item.option_method === 'option_once' && item.boolean_public_now === false);
    logger.info('需要触发的一次性消息定义数量->', valuedOnceMessageDefineList.length);

    // 周期性任务
    const valuedCycleMessageDefineList = [];
    const cycleMessageDefineList = messageDefineRecords.filter(item => item.option_method === 'option_cycle');

    cycleMessageDefineList.forEach(cycleMessageDefine => {
        const { datetime_start: startTime, datetime_end: endTime, option_time_cycle: cycleType, repetition_rate: repetitionRate, title } = cycleMessageDefine;
        const startDate = dayjs(startTime);
        const endDate = dayjs(endTime);
        console.info('当前循环的定义记录->', title, 'startDate', startDate.format('YYYY-MM-DD HH:mm:ss'), 'endDate', endDate.format('YYYY-MM-DD HH:mm:ss'), repetitionRate );
        
        let unit;

        switch (cycleType) {
            case 'option_day':
                unit = 'day';
                break;
            case 'option_week':
                unit = 'week';
                break;
            case 'option_month':
                unit = 'month';
                break;
            case 'option_quarter':
                unit = 'month';
                repetitionRate *= 3;
                break;
            case 'option_half_year':
                unit = 'month';
                repetitionRate *= 6;
                break;
            case 'option_year':
                unit = 'year';
                break;
            default:
                return;
        }

        let currentDate = startDate;
        while (currentDate.isBefore(endDate) || currentDate.isSame(endDate)) {
            const triggerTime = currentDate.valueOf();
            const hourMinute = startDate.format('HH:mm');
            const dailyTriggerTime = dayjs(`${dayjs(currentTime).format('YYYY-MM-DD')} ${hourMinute}`).valueOf();
            console.info('while循环内的触发时间', dayjs(dailyTriggerTime).format("YYYY-MM-DD HH:mm:ss"));

            if (currentDate.format('YYYY-MM-DD') === dayjs(currentTime).format('YYYY-MM-DD')) {
                if (currentTime >= dailyTriggerTime - timeBuffer && currentTime <= dailyTriggerTime + timeBuffer) {
                    valuedCycleMessageDefineList.push(cycleMessageDefine);
                }
            } else {
                if (currentTime >= triggerTime - timeBuffer && currentTime <= triggerTime + timeBuffer) {
                    valuedCycleMessageDefineList.push(cycleMessageDefine);
                }
            }

            currentDate = currentDate.add(repetitionRate, unit);
        }
    });

    logger.info('需要触发的周期消息定义数量->', valuedCycleMessageDefineList.length);

    const valuedMessageDefineList = [...valuedOnceMessageDefineList, ...valuedCycleMessageDefineList];
    logger.info('✅ 需要触发的消息定义总数量->', valuedMessageDefineList.length);
    return valuedMessageDefineList;

=======
    const unitMapping = {
        option_day: 'day',
        option_week: 'week',
        option_month: 'month',
        option_quarter: { unit: 'month', factor: 3 },
        option_half_year: { unit: 'month', factor: 6 },
        option_year: 'year',
    };

    let valuedMessageDefineList = [];

    const calculateTriggerDates = (startDate, endDate, repetitionRate, unit) => {
        const triggerDates = [];
        let nextTriggerDate = startDate;

        while (nextTriggerDate.isBefore(endDate) || nextTriggerDate.isSame(endDate)) {
            triggerDates.push(nextTriggerDate.format('YYYY-MM-DD'));
            nextTriggerDate = nextTriggerDate.add(repetitionRate, unit);
        }

        return triggerDates;
    };

    const isTriggerTime = (currentTime, triggerTime, timeBuffer) => {
        return currentTime >= triggerTime - timeBuffer && currentTime <= triggerTime + timeBuffer;
    };

    // 循环所有 messageDefineRecords
    for (const message of messageDefineRecords) {
        if (message.option_method === 'option_once') {
            valuedMessageDefineList.push(message);
            logger.info(`一次性消息: ${message.title}`);
            continue;
        }

        if (message.option_method === 'option_cycle') {
            const { datetime_start: startTime, datetime_end: endTime, option_time_cycle: cycleType, repetition_rate: repetitionRate } = message;
            const startDate = dayjs(startTime);
            const endDate = dayjs(endTime);
            let unit,
                factor = 1;

            if (unitMapping[cycleType]) {
                if (typeof unitMapping[cycleType] === 'object') {
                    unit = unitMapping[cycleType].unit;
                    factor = unitMapping[cycleType].factor;
                } else {
                    unit = unitMapping[cycleType];
                }
            } else {
                logger.warn(`未知的周期类型: ${cycleType}`);
                continue;
            }

            const triggerDates = calculateTriggerDates(startDate, endDate, repetitionRate * factor, unit);

            logger.info(`周期消息: ${message.title} 触发日期数组: ${triggerDates.join(', ')}`);

            if (triggerDates.includes(currentDate)) {
                const triggerTime = dayjs(`${currentDate} ${startDate.format('HH:mm:ss')}`).valueOf();

                if (isTriggerTime(currentTime, triggerTime, timeBuffer)) {
                    valuedMessageDefineList.push(message);
                    logger.info(`周期消息: ${message.title} 触发时间: ${triggerTime}, ${dayjs(triggerTime).format('YYYY-MM-DD HH:mm:ss')}`);
                }
            }
        }
    }

    logger.info('需要触发的消息定义数量->', valuedMessageDefineList.length);

    // 如果为空数组，直接返回
    if (valuedMessageDefineList.length === 0) {
        return {
            message: '没有需要触发的消息定义',
        };
    }

    // return valuedMessageDefineList;

>>>>>>> 5ef7959 (增加关键触发器函数)
    // 创建一个函数，用于调用消息生成函数，最后使用 Promise.all 来并发执行 valuedMessageDefineList 内的消息定义
    const invokeMessageGenerateFunction = async messageDefine => {
        // 调用消息生成函数
        return faas.function('TimedGenerationMessage').invoke(messageDefine);
    };

    // 并发执行消息生成函数
    const messageGenerationResult = await Promise.all(valuedMessageDefineList.map(invokeMessageGenerateFunction));
    logger.info('消息生成函数执行结果->', messageGenerationResult);

    const successList = messageGenerationResult.filter(item => item.code === 0);
    const failList = messageGenerationResult.filter(item => item.code !== 0);

    return {
        message: '消息触发器函数执行成功',
        successList,
        failList
    };
};

const { newLarkClient } = require('../utils');


/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {

    logger.info("开始执行函数\n", JSON.stringify({ timestamp: new Date(), user: context.user._id }, null, 2));
    logger.info(params);

    let response = {
        code: 0,
        message: ""
    };

    if (!params.chat_id || !params.group_tab) {
        response.code = -1;
        response.message = "缺少必要的参数：群ID或群置顶信息";
        logger.error(response.message);
        return response;
    }

    let { chat_id, group_tab } = params;
    let { pin_name, pin_url, pin_icon } = group_tab;

    if (!pin_name || !pin_url) {
        response.code = -1;
        response.message = "群置顶中中缺少必要的属性: 置顶名称和置顶链接";
        logger.error(response.message);
        return response;
    }

    // 清理pin_url中的换行和空格
    pin_url = pin_url.replace(/[\n\s]/g, '');
    logger.info('处理后的URL：', pin_url);

    let client = await newLarkClient({ userId: context.user._id }, logger);
    let image_key = null;

    try {
        // 处理图标上传
        if (pin_icon && pin_icon.length > 0 && pin_icon[0]) {
            let file = await application.resources.file.download(pin_icon[0]);
            let image_key_res = await client.im.image.create({
                data: {
                    image_type: 'message',
                    image: file,
                },
            });

            if (image_key_res.code !== 0) {
                logger.error("图片上传失败", { image_key_res });
                throw new Error("图片上传失败: " + image_key_res);
            }

            image_key = image_key_res.data.image_key;
        }

        // 创建群置顶
        let res = await client.im.chatTab.create({
            path: {
                chat_id: chat_id,
            },
            data: {
                chat_tabs: [{
                    tab_name: pin_name,
                    tab_type: 'url',
                    tab_content: {
                        url: pin_url
                    },
                    tab_config: {
                        icon_key: image_key,
                        is_built_in: true
                    }
                }]
            }
        });

        if (res.code !== 0) {
            logger.error("创建群置顶失败", { res });
            throw new Error("创建群置顶失败: " + res.message);
        }

        response.message = "群置顶成功创建";
    } catch (error) {
        logger.error("操作失败", { error });
        response.code = -1;
        response.message = "操作失败: " + error.message;
    }

    return response;

}
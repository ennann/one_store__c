const lark = require('@larksuiteoapi/node-sdk');

/**
 *
 * @param {{ userId: String} params
 * @param {Logger} logger
 * @returns {lark.Client}
 */
exports.newLarkClient = async function (params, logger) {
    const { userId } = params || {};
    const { appId, tenantAccessToken } = await application.integration.getDefaultTenantAccessToken();
    logger.info('appId', appId);

    const client = new lark.Client({ appId, appSecret: 'fake' });
    client.tokenManager.cache.set(lark.CTenantAccessToken, tenantAccessToken, null, { namespace: appId });

    client.httpInstance.interceptors.response.use(
        resp => resp,
        async error => {
            const detail = ['接口：', error.request.path, '，失败原因：', error.response.data.msg];
            if (error.response.data.error?.helps?.length) {
                detail.push(...['，参考链接：', error.response.data.error.helps[0].url]);
            }
            logger && logger.info('调用开放平台接口失败，', ...detail);

            if (userId) {
                try {
                    await application.msg.notifyCenter.create({
                        icon: 'error',
                        title: new kunlun.type.Multilingual({
                            zh: '调用开放平台接口失败',
                        }),
                        detail: new kunlun.type.Multilingual({
                            zh: detail.join(''),
                        }),
                        target_users: [userId],
                    });
                } catch (e) {}
            }

            return Promise.reject(error);
        },
    );

    return client;
};

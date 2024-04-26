/**
 * @description Convert raw records to group menu structure
 * @param {*} recordsData
 * @returns {[]}
 */
function convertRecordsToGroupMenu(recordsData) {
    // Early exit if recordsData is empty
    if (!recordsData || recordsData.length === 0) {
        return [];
    }

    // Helper to create the redirect link structure for children with a link
    const createRedirectLink = (menuLink, mobileLink) => {
        // Clean and check the mobileLink
        const cleanMobileLink = mobileLink ? mobileLink.trim() : '';

        // Create the base redirect link object
        let redirectLink = {
            common_url: menuLink.trim() || 'https://open.feishu.cn',
        };

        // Conditionally add mobile URLs if mobileLink is valid
        if (cleanMobileLink) {
            redirectLink.android_url = cleanMobileLink;
            redirectLink.ios_url = cleanMobileLink;
        }

        return redirectLink;
    };
    // Separate the top-level menus from child menus
    let chat_menu_top_levels = recordsData.filter(item => item.parent_menu === null);
    let chat_menu_children_levels = recordsData.filter(item => item.parent_menu !== null);

    // Map top-level menus to the desired structure, initialize children array
    let structuredMenus = chat_menu_top_levels.map(topLevel => {
        let children = chat_menu_children_levels
            .filter(child => child.parent_menu && child.parent_menu._id === topLevel._id)
            .map(child => ({
                chat_menu_item: {
                    action_type: child.menu_link ? 'REDIRECT_LINK' : 'NONE',
                    name: child.name,
                    redirect_link: child.menu_link ? createRedirectLink(child.menu_link, child.mobile_link) : undefined,
                },
            }));

        // Create the basic menu object
        let menu = {
            chat_menu_item: {
                action_type: topLevel.menu_link && children.length > 0 ? 'NONE' : topLevel.menu_link ? 'REDIRECT_LINK' : 'NONE', // Enforce 'NONE' if there are children
                name: topLevel.name,
                redirect_link: topLevel.menu_link && !children.length ? createRedirectLink(topLevel.menu_link, topLevel.mobile_link) : undefined,
            },
        };

        // Only add children if there are any
        if (children.length > 0) {
            menu.children = children;
        }

        return menu;
    });

    // remove top-level redirect_link property if there are children
    structuredMenus.forEach(menu => {
        if (menu.children && menu.children.length > 0) {
            delete menu.chat_menu_item.redirect_link;
        }
    });

    return {
        menu_tree: {
            chat_menu_top_levels: structuredMenus,
        },
    };
}


exports.convertRecordsToGroupMenu = convertRecordsToGroupMenu;

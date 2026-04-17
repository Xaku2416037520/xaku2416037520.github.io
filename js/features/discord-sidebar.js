/**
 * discord-sidebar.js
 * Discord 风格左侧栏逻辑：图标轨道、会话列表、头像弹窗、三点菜单
 * 依赖：state.js / core.js / onboarding.js / listeners.js 已加载
 */

(function () {
    'use strict';

    /* ───────────────────────────────────────────────
       内部工具
    ─────────────────────────────────────────────── */

    /** 从 localforage 批量加载所有会话的 partnerAvatar（返回 Map<sessionId, src>） */
    async function _loadAllAvatars() {
        const map = new Map();
        if (!Array.isArray(sessionList) || sessionList.length === 0) return map;

        await Promise.all(
            sessionList.map(async (s) => {
                try {
                    const src = await localforage.getItem(`${APP_PREFIX}${s.id}_partnerAvatar`);
                    if (src) map.set(s.id, src);
                } catch (_) {}
            })
        );
        return map;
    }

    /** 从 localforage 加载一个会话的最后一条消息（返回 {sender, text, image} 或 null） */
    async function _loadLastMessage(sessionId) {
        try {
            // 当前会话直接用内存中的 messages 数组，无需再读 localforage
            if (sessionId === SESSION_ID && Array.isArray(messages) && messages.length > 0) {
                return messages[messages.length - 1];
            }
            const msgs = await localforage.getItem(`${APP_PREFIX}${sessionId}_chatMessages`);
            if (Array.isArray(msgs) && msgs.length > 0) {
                return msgs[msgs.length - 1];
            }
        } catch (_) {}
        return null;
    }

    /** 从 localforage 加载一个会话的 settings（只取 partnerName / myName） */
    async function _loadSessionNames(sessionId) {
        try {
            // loadData() 使用 getStorageKey('chatSettings') 存储 settings
            const s = await localforage.getItem(`${APP_PREFIX}${sessionId}_chatSettings`);
            if (s && typeof s === 'object') {
                return {
                    partnerName: s.partnerName || '梦角',
                    myName: s.myName || '我',
                };
            }
        } catch (_) {}
        return { partnerName: '梦角', myName: '我' };
    }

    /** 构造预览文本 */
    function _buildPreview(lastMsg, myName, partnerName) {
        if (!lastMsg) return '暂无消息';
        if (lastMsg.type === 'system') return lastMsg.text || '系统消息';
        if (lastMsg.sender === 'user') {
            // 自己发的，显示纯文本
            if (lastMsg.image) return '🖼 图片';
            return (lastMsg.text || '').slice(0, 30) || '🖼 图片';
        }
        // 对方消息，显示 "名字: 内容"
        const senderLabel = partnerName || lastMsg.sender || '对方';
        const content = lastMsg.image ? '🖼 图片' : (lastMsg.text || '').slice(0, 24);
        return `${senderLabel}: ${content}`;
    }

    /** 为头像 div 注入内容（img 或首字母） */
    function _fillAvatarDiv(el, avatarSrc, name) {
        el.innerHTML = '';
        if (avatarSrc) {
            const img = document.createElement('img');
            img.src = avatarSrc;
            img.alt = name || '头像';
            el.appendChild(img);
        } else {
            const span = document.createElement('span');
            const initial = (name || '?').charAt(0);
            span.className = el.dataset.initialClass || 'dc-rail-avatar-initial';
            span.textContent = initial;
            el.appendChild(span);
        }
    }

    /* ───────────────────────────────────────────────
       渲染：图标轨道
    ─────────────────────────────────────────────── */
    async function dcRenderIconRail() {
        const rail = document.getElementById('dc-icon-rail-inner');
        if (!rail) return;
        rail.innerHTML = '';

        if (!Array.isArray(sessionList) || sessionList.length === 0) return;

        const avatarMap = await _loadAllAvatars();

        for (const session of sessionList) {
            const div = document.createElement('div');
            div.className = 'dc-rail-avatar' + (session.id === SESSION_ID ? ' active' : '');
            div.dataset.id = session.id;
            div.title = session.name;

            // 加载名字用于首字母 fallback；当前会话直接取内存设置
            let partnerNameForRail;
            if (session.id === SESSION_ID && window.settings && settings.partnerName) {
                partnerNameForRail = settings.partnerName;
            } else {
                const names = await _loadSessionNames(session.id);
                partnerNameForRail = names.partnerName;
            }
            div.dataset.initialClass = 'dc-rail-avatar-initial';

            const avatarSrc = avatarMap.get(session.id) || null;
            _fillAvatarDiv(div, avatarSrc, partnerNameForRail);

            // 点击：显示弹窗
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                _showAvatarPopup(session, avatarSrc, partnerNameForRail);
            });

            rail.appendChild(div);
        }
    }

    /* ───────────────────────────────────────────────
       渲染：会话列表侧边栏
    ─────────────────────────────────────────────── */
    async function dcRenderSidebar() {
        const list = document.getElementById('dc-session-list');
        if (!list) return;
        list.innerHTML = '';

        if (!Array.isArray(sessionList) || sessionList.length === 0) {
            list.innerHTML = '<div class="dc-session-empty"><i class="fas fa-comments"></i>还没有会话<br>点击右上方 + 新建</div>';
            return;
        }

        const avatarMap = await _loadAllAvatars();

        for (const session of sessionList) {
            let names;
            if (session.id === SESSION_ID && window.settings && settings.partnerName) {
                // 当前会话直接使用内存设置，避免多一次 localforage 读取
                names = { partnerName: settings.partnerName, myName: settings.myName || '我' };
            } else {
                names = await _loadSessionNames(session.id);
            }
            const lastMsg = await _loadLastMessage(session.id);
            const avatarSrc = avatarMap.get(session.id) || null;
            const preview = _buildPreview(lastMsg, names.myName, names.partnerName);

            const item = document.createElement('div');
            item.className = 'dc-session-item' + (session.id === SESSION_ID ? ' active' : '');
            item.dataset.id = session.id;

            // 头像
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'dc-session-item-avatar';
            if (avatarSrc) {
                const img = document.createElement('img');
                img.src = avatarSrc;
                img.alt = names.partnerName;
                avatarDiv.appendChild(img);
            } else {
                const span = document.createElement('span');
                span.className = 'dc-session-item-initial';
                span.textContent = (names.partnerName || '?').charAt(0);
                avatarDiv.appendChild(span);
            }

            // 点击头像显示弹窗
            avatarDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                _showAvatarPopup(session, avatarSrc, names.partnerName);
            });

            // 文字信息
            const infoDiv = document.createElement('div');
            infoDiv.className = 'dc-session-item-info';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'dc-session-item-name';
            nameDiv.textContent = names.partnerName || session.name;

            const previewDiv = document.createElement('div');
            previewDiv.className = 'dc-session-item-preview';
            previewDiv.textContent = preview;

            infoDiv.appendChild(nameDiv);
            infoDiv.appendChild(previewDiv);
            item.appendChild(avatarDiv);
            item.appendChild(infoDiv);

            // 点击切换会话
            item.addEventListener('click', () => {
                _closeMobileSidebar();
                _switchSession(session.id);
            });

            list.appendChild(item);
        }
    }

    /* ───────────────────────────────────────────────
       渲染全部（轨道 + 列表，同时发起以节省时间）
    ─────────────────────────────────────────────── */
    async function dcRenderAll() {
        await dcRenderSidebar();
    }

    /* ───────────────────────────────────────────────
       切换会话
    ─────────────────────────────────────────────── */
    function _switchSession(sessionId) {
        if (sessionId === SESSION_ID) return; // 已是当前，忽略
        if (confirm('切换会话将刷新页面，确定要继续吗？')) {
            window.location.hash = sessionId;
            window.location.reload();
        }
    }

    /* ───────────────────────────────────────────────
       头像弹窗
    ─────────────────────────────────────────────── */
    // 记录当前弹窗对应的会话
    let _popupSessionId = null;

    function _showAvatarPopup(session, avatarSrc, partnerName) {
        const popup = document.getElementById('dc-avatar-popup');
        if (!popup) return;

        _popupSessionId = session.id;

        const avatarEl = document.getElementById('dc-avatar-popup-avatar');
        const nameEl   = document.getElementById('dc-avatar-popup-name');
        const metaEl   = document.getElementById('dc-avatar-popup-meta');

        // 填充头像
        avatarEl.innerHTML = '';
        if (avatarSrc) {
            const img = document.createElement('img');
            img.src = avatarSrc;
            img.alt = partnerName;
            avatarEl.appendChild(img);
        } else {
            avatarEl.textContent = (partnerName || '?').charAt(0);
            avatarEl.style.fontSize = '24px';
            avatarEl.style.fontWeight = '700';
            avatarEl.style.color = 'var(--accent-color)';
        }

        nameEl.textContent = partnerName || session.name;
        metaEl.textContent = '创建于 ' + new Date(session.createdAt).toLocaleDateString('zh-CN');

        // 当前会话时隐藏"切换到此会话"按钮
        const switchBtn = document.getElementById('dc-popup-switch');
        if (switchBtn) {
            switchBtn.style.display = (session.id === SESSION_ID) ? 'none' : '';
        }

        popup.classList.remove('dc-avatar-popup-hidden');
    }

    function _hideAvatarPopup() {
        const popup = document.getElementById('dc-avatar-popup');
        if (popup) popup.classList.add('dc-avatar-popup-hidden');
    }

    /* ───────────────────────────────────────────────
       重命名 / 删除
    ─────────────────────────────────────────────── */
    function _renameCurrentSession() {
        const targetId = _popupSessionId || SESSION_ID;
        const session = sessionList.find(s => s.id === targetId);
        if (!session) return;
        const newName = prompt('输入新的会话名称:', session.name);
        if (newName && newName.trim()) {
            session.name = newName.trim();
            localforage.setItem(`${APP_PREFIX}sessionList`, sessionList);
            if (typeof showNotification === 'function') showNotification('会话已重命名', 'success');
            // 同步刷新侧栏（不重载页面）
            dcRenderAll();
        }
    }

    /* 删除当前会话 */
    function _deleteCurrentSession() {
        const targetId = _popupSessionId || SESSION_ID;
        if (sessionList.length <= 1) {
            if (typeof showNotification === 'function') showNotification('无法删除最后一个会话', 'warning');
            return;
        }
        if (!confirm('确定要删除此会话及其所有聊天记录吗？此操作不可恢复')) return;

        sessionList = sessionList.filter(s => s.id !== targetId);
        localforage.setItem(`${APP_PREFIX}sessionList`, sessionList);

        // 清除存储
        try {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(`${APP_PREFIX}${targetId}_`)) {
                    try { localStorage.removeItem(key); } catch (_) {}
                }
            });
        } catch (_) {}
        localforage.keys().then(keys => {
            keys.forEach(key => {
                if (key.startsWith(`${APP_PREFIX}${targetId}_`)) {
                    localforage.removeItem(key).catch(() => {});
                }
            });
        }).catch(() => {});

        const newCurrentId = sessionList[0].id;
        window.location.hash = newCurrentId;
        window.location.reload();
    }

    /* ───────────────────────────────────────────────
       新建会话入口（轨道 + 侧栏按钮）
    ─────────────────────────────────────────────── */
    async function _dcCreateNewSession() {
        if (typeof createNewSession === 'function') {
            await createNewSession(true); // 新建后直接切换
        }
    }

    /* ───────────────────────────────────────────────
       移动端侧栏开关
    ─────────────────────────────────────────────── */
    function _openMobileSidebar() {
        const rail    = document.getElementById('dc-icon-rail');
        const sidebar = document.getElementById('dc-sidebar');
        const overlay = document.getElementById('dc-mobile-overlay');
        if (rail)    rail.classList.add('dc-mobile-open');
        if (sidebar) sidebar.classList.add('dc-mobile-open');
        if (overlay) overlay.classList.add('dc-mobile-overlay-show');
    }

    function _closeMobileSidebar() {
        const rail    = document.getElementById('dc-icon-rail');
        const sidebar = document.getElementById('dc-sidebar');
        const overlay = document.getElementById('dc-mobile-overlay');
        if (rail)    { rail.classList.remove('dc-mobile-open'); rail.classList.add('dc-mobile-closing'); }
        if (sidebar) { sidebar.classList.remove('dc-mobile-open'); sidebar.classList.add('dc-mobile-closing'); }
        if (overlay) overlay.classList.remove('dc-mobile-overlay-show');
        setTimeout(() => {
            if (rail)    rail.classList.remove('dc-mobile-closing');
            if (sidebar) sidebar.classList.remove('dc-mobile-closing');
        }, 270);
    }

    /* ───────────────────────────────────────────────
       绑定事件监听
    ─────────────────────────────────────────────── */
    function _bindEvents() {
        // 图标轨道 — 新建按钮
        const railAdd = document.getElementById('dc-icon-rail-add');
        if (railAdd) railAdd.addEventListener('click', _dcCreateNewSession);

        // 侧栏标题区 — 新建按钮（已迁移至轨道，ID 不变，继续绑定）
        const sidebarNew = document.getElementById('dc-sidebar-new-btn');
        if (sidebarNew) sidebarNew.addEventListener('click', _dcCreateNewSession);

        // 轨道内会话管理按钮：切换侧边栏显示/隐藏
        const sessionMgr = document.getElementById('dc-rail-session-mgr');
        if (sessionMgr) {
            sessionMgr.addEventListener('click', () => {
                const sidebar = document.getElementById('dc-sidebar');
                if (!sidebar) return;
                const isHidden = sidebar.classList.contains('dc-sidebar-collapsed');
                if (isHidden) {
                    sidebar.classList.remove('dc-sidebar-collapsed');
                    sessionMgr.classList.add('active');
                } else {
                    sidebar.classList.add('dc-sidebar-collapsed');
                    sessionMgr.classList.remove('active');
                }
            });
        }

        // 头像弹窗关闭
        const popupClose = document.getElementById('dc-avatar-popup-close');
        if (popupClose) popupClose.addEventListener('click', _hideAvatarPopup);

        // 头像弹窗：切换会话按钮
        const popupSwitch = document.getElementById('dc-popup-switch');
        if (popupSwitch) popupSwitch.addEventListener('click', () => {
            _hideAvatarPopup();
            if (_popupSessionId) _switchSession(_popupSessionId);
        });

        // 头像弹窗：重命名按钮
        const popupRename = document.getElementById('dc-popup-rename');
        if (popupRename) popupRename.addEventListener('click', () => {
            _hideAvatarPopup();
            _renameCurrentSession();
        });

        // 头像弹窗：删除按钮
        const popupDelete = document.getElementById('dc-popup-delete');
        if (popupDelete) popupDelete.addEventListener('click', () => {
            _hideAvatarPopup();
            _deleteCurrentSession();
        });

        // 点击弹窗外关闭
        document.addEventListener('click', (e) => {
            const popup = document.getElementById('dc-avatar-popup');
            if (popup && !popup.classList.contains('dc-avatar-popup-hidden')) {
                if (!popup.contains(e.target) && !e.target.closest('.dc-session-item-avatar')) {
                    _hideAvatarPopup();
                }
            }
        });

        // 左箭头按钮：切换侧栏开/关（所有屏幕尺寸）
        const mobileOpenBtn = document.getElementById('dc-mobile-open-btn');
        if (mobileOpenBtn) mobileOpenBtn.addEventListener('click', () => {
            const rail = document.getElementById('dc-icon-rail');
            if (rail && rail.classList.contains('dc-mobile-open')) {
                _closeMobileSidebar();
            } else {
                _openMobileSidebar();
            }
        });

        // 移动端：遮罩点击关闭侧栏
        const overlay = document.getElementById('dc-mobile-overlay');
        if (overlay) overlay.addEventListener('click', _closeMobileSidebar);
    }

    /* 挂载到 window，供外部调用刷新 */
    window.dcRenderAll       = dcRenderAll;
    window.dcRenderSidebar   = dcRenderSidebar;
    window.dcRenderIconRail  = dcRenderIconRail;

    /* 绑定事件（在 DOMContentLoaded 或立即，取决于 DOM 状态）
       渲染由 app.js 在 initializeSession + loadData 完成后通过 dcRenderAll() 显式触发 */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _bindEvents);
    } else {
        _bindEvents();
    }
})();

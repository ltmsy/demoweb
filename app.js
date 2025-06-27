// 目标域名列表
const DOMAINS = [
    'https://aistock.xianfenkeji.com',
    'https://jguwn2.gzjsvr.com',
    'https://hua287x.tplgin.com',
    'https://teng8dhe.tplgin.com'
];

// 状态管理
let currentDomain = null;
let availableDomains = [];

// DOM元素引用
const appStoreContainer = document.getElementById('appStoreContainer');
const errorContainer = document.getElementById('errorContainer');
const errorText = document.getElementById('errorText');
const mainIframe = document.getElementById('mainIframe');
const downloadButton = document.getElementById('downloadButton');
const downloadText = document.getElementById('downloadText');

// PWA安装相关变量
let deferredPrompt = null;
let isInstallable = false;
let isPWAMode = false;

// 日志函数
function log(message) {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

// 更新下载按钮状态
function updateDownloadButton(state, text) {
    if (!downloadButton || !downloadText) return;
    
    // 移除所有状态类
    downloadButton.classList.remove('installing', 'installed');
    
    // 添加新状态类
    if (state) {
        downloadButton.classList.add(state);
    }
    
    // 更新文字
    downloadText.textContent = text;
}

// 显示App Store页面
function showAppStore() {
    appStoreContainer.style.display = 'block';
    errorContainer.style.display = 'none';
    mainIframe.style.display = 'none';
    
    // 移除iframe模式的背景色
    document.body.classList.remove('iframe-mode');
    
    log('显示App Store页面');
}

// 显示iframe内容
function showIframe() {
    appStoreContainer.style.display = 'none';
    errorContainer.style.display = 'none';
    mainIframe.style.display = 'block';
    
    // 设置body背景色
    document.body.classList.add('iframe-mode');
    
    // PWA模式下动态调整iframe高度
    if (isPWAMode) {
        adjustIframeHeight();
    }
    
    log('已显示iframe内容');
}

// 显示错误界面
function showError(message, fallbackDomain = null) {
    appStoreContainer.style.display = 'none';
    errorContainer.style.display = 'flex';
    errorText.textContent = message;
    
    // 移除iframe模式的背景色
    document.body.classList.remove('iframe-mode');
    
    // 10秒后自动重试
    setTimeout(() => {
        log('自动重试检测...');
        location.reload();
    }, 10000);
}

// 简单的连通性检测
async function testDomain(domain) {
    try {
        const startTime = performance.now();
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(domain, {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-store',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const responseTime = Math.round(performance.now() - startTime);
        
        log(`域名 ${domain} 检测成功，响应时间: ${responseTime}ms`);
        return { success: true, responseTime, domain };
        
    } catch (error) {
        log(`域名 ${domain} 检测失败: ${error.message}`);
        return { success: false, error: error.message, domain };
    }
}

// 加载iframe
function loadIframe(domain) {
    return new Promise((resolve, reject) => {
        currentDomain = domain;
        
        // 设置iframe加载超时
        const timeout = setTimeout(() => {
            reject(new Error('iframe加载超时'));
        }, 15000);
        
        // iframe加载事件
        const onLoad = () => {
            clearTimeout(timeout);
            mainIframe.removeEventListener('load', onLoad);
            mainIframe.removeEventListener('error', onError);
            resolve();
        };
        
        const onError = () => {
            clearTimeout(timeout);
            mainIframe.removeEventListener('load', onLoad);
            mainIframe.removeEventListener('error', onError);
            reject(new Error('iframe加载失败'));
        };
        
        mainIframe.addEventListener('load', onLoad);
        mainIframe.addEventListener('error', onError);
        
        // 开始加载
        mainIframe.src = domain;
    });
}

// PWA模式下的域名检测（带启动页管理）
async function findBestDomainForPWA() {
    log('PWA模式：开始后台检测所有域名...');
    
    // 记住用户上次访问的成功域名
    const lastWorkingDomain = localStorage.getItem('lastWorkingDomain');
    
    // 优先检测上次成功的域名
    let domainsToCheck = [...DOMAINS];
    if (lastWorkingDomain && DOMAINS.includes(lastWorkingDomain)) {
        domainsToCheck = domainsToCheck.filter(d => d !== lastWorkingDomain);
        domainsToCheck.unshift(lastWorkingDomain);
        log(`优先检测上次成功域名: ${lastWorkingDomain}`);
    }
    
    let bestDomain = null;
    let fastestTime = Infinity;
    availableDomains = [];
    
    // 串行检测域名
    for (let i = 0; i < domainsToCheck.length; i++) {
        const domain = domainsToCheck[i];
        log(`PWA模式检测中 ${i + 1}/${domainsToCheck.length}: ${domain}`);
        
        const result = await testDomain(domain);
        
        if (result.success) {
            availableDomains.push(result);
            
            // 记录最快的域名
            if (result.responseTime < fastestTime) {
                fastestTime = result.responseTime;
                bestDomain = result;
            }
            
            // 如果是上次成功的域名且响应时间合理，直接选择
            if (domain === lastWorkingDomain && result.responseTime < 3000) {
                bestDomain = result;
                log(`PWA模式选择上次成功域名: ${domain} (${result.responseTime}ms)`);
                break;
            }
        }
    }
    
    if (bestDomain) {
        // 保存成功的域名
        localStorage.setItem('lastWorkingDomain', bestDomain.domain);
        
        log(`PWA模式选定最佳域名: ${bestDomain.domain} (${bestDomain.responseTime}ms)`);
        
        try {
            // 加载iframe
            await loadIframe(bestDomain.domain);
            
            // 隐藏启动页
            hideSplashScreen();
            
            // 显示iframe（延迟一点确保启动页完全消失）
            setTimeout(() => {
                showIframe();
                log(`PWA模式iframe加载成功: ${bestDomain.domain}`);
            }, 300);
            
        } catch (error) {
            log(`PWA模式iframe加载失败: ${error.message}`);
            // 隐藏启动页并显示错误
            hideSplashScreen();
            setTimeout(() => {
                showError('应用启动失败，请稍后重试');
            }, 300);
        }
        
    } else {
        log('PWA模式：所有域名检测失败');
        // 隐藏启动页并显示错误
        hideSplashScreen();
        setTimeout(() => {
            showError('暂时无法连接到服务器');
        }, 300);
    }
}

// 检测是否为iOS设备和版本
function isIOSDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

// 获取iOS版本
function getIOSVersion() {
    const match = navigator.userAgent.match(/OS (\d+)_(\d+)_?(\d+)?/);
    if (match) {
        return {
            major: parseInt(match[1], 10),
            minor: parseInt(match[2], 10),
            patch: parseInt(match[3] || 0, 10)
        };
    }
    return null;
}

// 检测是否支持PWA安装API
function supportsPWAInstall() {
    return 'BeforeInstallPromptEvent' in window || 
           'onbeforeinstallprompt' in window;
}

// 检测iOS是否支持PWA安装提示
function iosSupportsInstallPrompt() {
    const version = getIOSVersion();
    if (!version) return false;
    
    // iOS 16.4+ 开始支持PWA安装API
    return (version.major > 16) || 
           (version.major === 16 && version.minor >= 4);
}

// 尝试触发PWA安装（适用于iOS 16.4+）
async function tryIOSInstall() {
    try {
        // 检查是否已经是PWA模式
        if (window.navigator.standalone) {
            return false;
        }

        // 尝试使用现代API
        if ('getInstalledRelatedApps' in navigator) {
            const apps = await navigator.getInstalledRelatedApps();
            if (apps.length > 0) {
                return false; // 已安装
            }
        }

        // 尝试触发安装提示
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const result = await deferredPrompt.userChoice;
            return result.outcome === 'accepted';
        }

        return false;
    } catch (error) {
        log('iOS安装尝试失败: ' + error.message);
        return false;
    }
}

// 改进的iOS安装处理
async function handleIOSInstall() {
    log('iOS设备安装指导');
    
    // 更新按钮状态
    updateDownloadButton('', '查看安装说明');
    
    // 直接显示手动安装指导，不使用Web Share API
    showManualIOSGuide();
}

// 显示手动安装指导
function showManualIOSGuide() {
    // 创建详细的安装指导弹窗
    const guide = document.createElement('div');
    guide.id = 'installGuide';
    guide.innerHTML = `
        <div class="guide-content">
            <div class="guide-header">
                <h3>📱 安装JUYING AI到桌面</h3>
                <button class="close-btn" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
            </div>
            <div class="guide-steps">
                <div class="step">
                    <div class="step-number">1</div>
                    <div class="step-text">点击底部工具栏的<strong>分享按钮</strong> 📤</div>
                </div>
                <div class="step">
                    <div class="step-number">2</div>
                    <div class="step-text">向下滑动找到<strong>"添加到主屏幕"</strong>选项</div>
                </div>
                <div class="step">
                    <div class="step-number">3</div>
                    <div class="step-text">点击<strong>"添加到主屏幕"</strong></div>
                </div>
                <div class="step">
                    <div class="step-number">4</div>
                    <div class="step-text">点击右上角<strong>"添加"</strong>按钮</div>
                </div>
            </div>
            <div class="guide-tip">
                💡 安装完成后可从桌面直接启动，享受原生应用体验！
            </div>
        </div>
    `;
    
    guide.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 5000;
        padding: 20px;
        box-sizing: border-box;
    `;
    
    // 添加CSS样式
    const style = document.createElement('style');
    style.textContent = `
        .guide-content {
            background: white;
            border-radius: 16px;
            padding: 0;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .guide-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .guide-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
        }
        .close-btn {
            background: none;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background 0.2s;
        }
        .close-btn:hover {
            background: rgba(255,255,255,0.2);
        }
        .guide-steps {
            padding: 20px;
        }
        .step {
            display: flex;
            align-items: flex-start;
            margin-bottom: 16px;
            gap: 12px;
        }
        .step:last-child {
            margin-bottom: 0;
        }
        .step-number {
            background: #007AFF;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 600;
            flex-shrink: 0;
        }
        .step-text {
            font-size: 16px;
            line-height: 1.4;
            color: #333;
        }
        .step-text strong {
            color: #007AFF;
            font-weight: 600;
        }
        .guide-tip {
            background: #f8f9fa;
            margin: 20px;
            padding: 16px;
            border-radius: 12px;
            font-size: 14px;
            color: #666;
            text-align: center;
            border-left: 4px solid #007AFF;
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(guide);
    
    // 点击背景关闭
    guide.addEventListener('click', (e) => {
        if (e.target === guide) {
            guide.remove();
            style.remove();
        }
    });
}

// 显示改进的iOS安装引导
function showImprovedIOSGuide() {
    const version = getIOSVersion();
    log(`iOS版本: ${version?.major}.${version?.minor}`);
    
    // 直接使用手动引导方案
    updateDownloadButton('', '安装');
    downloadButton.onclick = handleIOSInstall;
}

// 检测PWA模式
function detectPWAMode() {
    isPWAMode = window.navigator.standalone === true || 
               window.matchMedia('(display-mode: standalone)').matches;
    
    log(`检测到${isPWAMode ? 'PWA' : '浏览器'}模式`);
    return isPWAMode;
}

// 处理PWA安装
async function handleInstall() {
    if (!deferredPrompt) {
        log('无法安装：没有安装提示');
        if (isIOSDevice()) {
            alert('请点击浏览器底部的分享按钮（📤），然后选择"添加到主屏幕"');
        } else {
            alert('您的浏览器不支持PWA安装，请使用Chrome、Edge等现代浏览器访问');
        }
        return;
    }

    try {
        updateDownloadButton('installing', '正在安装...');
        
        // 显示安装对话框
        deferredPrompt.prompt();
        
        // 等待用户选择
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            log('用户接受安装');
            updateDownloadButton('installed', '已安装');
            
            // 3秒后开始应用
            setTimeout(() => {
                findBestDomain();
            }, 2000);
        } else {
            log('用户拒绝安装');
            updateDownloadButton('', '安装');
        }
        
        deferredPrompt = null;
        
    } catch (error) {
        log('安装失败: ' + error.message);
        updateDownloadButton('', '重新安装');
        
        // 3秒后恢复按钮
        setTimeout(() => {
            updateDownloadButton('', '安装');
        }, 3000);
    }
}

// 清除所有缓存的函数
async function clearAllCaches() {
    try {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
        );
        log('所有缓存已清除');
        return true;
    } catch (error) {
        log('清除缓存失败: ' + error.message);
        return false;
    }
}

// 显示PWA启动页
function showSplashScreen() {
    // 创建启动页容器
    const splashContainer = document.createElement('div');
    splashContainer.id = 'splashContainer';
    splashContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100vh;
        background: #f8f9fa;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 2000;
        opacity: 1;
        transition: opacity 0.5s ease;
    `;
    
    // 创建启动图片
    const splashImage = document.createElement('img');
    splashImage.src = 'img/jieshao.png';
    splashImage.style.cssText = `
        max-width: 90%;
        max-height: 80%;
        border-radius: 20px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        object-fit: contain;
    `;
    
    // 创建加载提示
    const loadingText = document.createElement('div');
    loadingText.style.cssText = `
        margin-top: 30px;
        font-size: 16px;
        color: #666;
        text-align: center;
        font-weight: 500;
    `;
    loadingText.textContent = '正在启动 JUYING AI...';
    
    // 创建加载动画
    const loadingDots = document.createElement('div');
    loadingDots.style.cssText = `
        margin-top: 20px;
        display: flex;
        gap: 8px;
        justify-content: center;
    `;
    
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.style.cssText = `
            width: 8px;
            height: 8px;
            background: #007AFF;
            border-radius: 50%;
            animation: loading-pulse 1.5s infinite;
            animation-delay: ${i * 0.3}s;
        `;
        loadingDots.appendChild(dot);
    }
    
    // 添加CSS动画
    const style = document.createElement('style');
    style.textContent = `
        @keyframes loading-pulse {
            0%, 80%, 100% {
                opacity: 0.3;
                transform: scale(0.8);
            }
            40% {
                opacity: 1;
                transform: scale(1);
            }
        }
    `;
    document.head.appendChild(style);
    
    splashContainer.appendChild(splashImage);
    splashContainer.appendChild(loadingText);
    splashContainer.appendChild(loadingDots);
    
    document.body.appendChild(splashContainer);
    
    log('显示PWA启动页');
    return splashContainer;
}

// 隐藏启动页
function hideSplashScreen() {
    const splashContainer = document.getElementById('splashContainer');
    if (splashContainer) {
        splashContainer.style.opacity = '0';
        setTimeout(() => {
            if (splashContainer.parentNode) {
                splashContainer.remove();
            }
        }, 500);
        log('隐藏PWA启动页');
    }
}

// 页面加载完成后开始检测
window.addEventListener('load', () => {
    log('页面加载完成，开始初始化...');
    
    // 首先检测PWA模式
    detectPWAMode();
    
    if (isPWAMode) {
        // PWA模式：显示启动页，后台执行域名轮询
        log('PWA模式：显示启动页并开始智能路由');
        
        // 隐藏App Store页面（如果显示了的话）
        appStoreContainer.style.display = 'none';
        
        // 显示启动页
        showSplashScreen();
        
        // 延迟1秒开始域名检测（给启动页一些展示时间）
        setTimeout(() => {
            findBestDomainForPWA();
        }, 1000);
        
    } else {
        // 浏览器模式：显示App Store风格页面
        log('浏览器模式：显示App Store页面');
        showAppStore();
        
        // 设置安装按钮
        if (isIOSDevice()) {
            showImprovedIOSGuide();
        } else {
            updateDownloadButton('', '安装');
        }
        
        // 延迟1秒后强制显示安装按钮（以防beforeinstallprompt没有触发）
        setTimeout(() => {
            if (!isInstallable && isIOSDevice()) {
                showImprovedIOSGuide();
            }
        }, 2000);
    }
});

// 注册Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
        .then(registration => {
            log('Service Worker注册成功');
            
            // 检查更新
            registration.addEventListener('updatefound', () => {
                log('发现新版本，正在更新...');
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        log('新版本已安装，建议刷新页面');
                        // 自动激活新版本
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });
            
            // 监听Service Worker控制权变化
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                log('Service Worker已更新，正在刷新页面...');
                window.location.reload();
            });
        })
        .catch(error => {
            log('Service Worker注册失败: ' + error.message);
        });
}

// 页面可见性变化时检查更新
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(registration => {
            if (registration) {
                registration.update();
            }
        });
    }
});

// 网络状态监听
window.addEventListener('online', () => {
    log('网络已连接，重新检测域名...');
    if (errorContainer.style.display !== 'none') {
        location.reload();
    }
});

window.addEventListener('offline', () => {
    log('网络已断开');
});

// 监听PWA安装提示事件
window.addEventListener('beforeinstallprompt', (e) => {
    log('PWA可以安装，显示安装按钮');
    e.preventDefault();
    deferredPrompt = e;
    isInstallable = true;
    
    // 只在浏览器模式下显示安装按钮
    if (!isPWAMode) {
        // 更新按钮文本为正常的安装文本
        updateDownloadButton('', '安装');
    }
});

// 监听PWA安装完成事件
window.addEventListener('appinstalled', () => {
    log('PWA安装成功');
    deferredPrompt = null;
    isInstallable = false;
});

// 绑定下载按钮点击事件
if (downloadButton) {
    downloadButton.addEventListener('click', handleInstall);
}

// 监听窗口大小和方向变化
window.addEventListener('resize', () => {
    if (isPWAMode && mainIframe && mainIframe.style.display === 'block') {
        log('窗口大小变化，重新调整iframe');
        setTimeout(adjustIframeHeight, 100);
    }
});

window.addEventListener('orientationchange', () => {
    if (isPWAMode && mainIframe && mainIframe.style.display === 'block') {
        log('设备方向变化，重新调整iframe');
        setTimeout(adjustIframeHeight, 300);
    }
});

// 监听页面焦点变化，检测用户是否操作了分享菜单
let shareMenuOpened = false;

window.addEventListener('blur', () => {
    if (isIOSDevice() && !isPWAMode) {
        shareMenuOpened = true;
        log('用户可能打开了分享菜单');
        
        // 隐藏指向箭头
        const arrow = document.getElementById('shareArrow');
        if (arrow) {
            arrow.style.opacity = '0.3';
            arrow.innerHTML = '👆 在分享菜单中找到"添加到主屏幕"';
        }
    }
});

window.addEventListener('focus', () => {
    if (shareMenuOpened && isIOSDevice() && !isPWAMode) {
        log('用户返回页面，检查是否已安装');
        
        // 延迟检查是否已经安装为PWA
        setTimeout(() => {
            if (window.navigator.standalone) {
                log('检测到PWA已安装');
            } else {
                // 用户没有安装，显示鼓励信息
                updateDownloadButton('', '再试一次？点击下方分享按钮', '📤');
            }
        }, 1000);
        
        shareMenuOpened = false;
    }
});

// 检测所有域名并选择最佳的（浏览器模式用）
async function findBestDomain() {
    log('开始后台检测所有域名...');
    
    // 记住用户上次访问的成功域名
    const lastWorkingDomain = localStorage.getItem('lastWorkingDomain');
    
    // 优先检测上次成功的域名
    let domainsToCheck = [...DOMAINS];
    if (lastWorkingDomain && DOMAINS.includes(lastWorkingDomain)) {
        domainsToCheck = domainsToCheck.filter(d => d !== lastWorkingDomain);
        domainsToCheck.unshift(lastWorkingDomain);
        log(`优先检测上次成功域名: ${lastWorkingDomain}`);
    }
    
    let bestDomain = null;
    let fastestTime = Infinity;
    availableDomains = [];
    
    // 更新按钮状态：正在检测域名
    updateDownloadButton('installing', '正在连接...');
    
    // 串行检测域名
    for (let i = 0; i < domainsToCheck.length; i++) {
        const domain = domainsToCheck[i];
        updateDownloadButton('installing', `检测中 ${i + 1}/${domainsToCheck.length}`);
        
        const result = await testDomain(domain);
        
        if (result.success) {
            availableDomains.push(result);
            
            // 记录最快的域名
            if (result.responseTime < fastestTime) {
                fastestTime = result.responseTime;
                bestDomain = result;
            }
            
            // 如果是上次成功的域名且响应时间合理，直接选择
            if (domain === lastWorkingDomain && result.responseTime < 3000) {
                bestDomain = result;
                log(`选择上次成功域名: ${domain} (${result.responseTime}ms)`);
                break;
            }
        }
    }
    
    if (bestDomain) {
        // 保存成功的域名
        localStorage.setItem('lastWorkingDomain', bestDomain.domain);
        
        updateDownloadButton('installing', '正在启动...');
        log(`选定最佳域名: ${bestDomain.domain} (${bestDomain.responseTime}ms)`);
        
        try {
            await loadIframe(bestDomain.domain);
            showIframe();
            log(`iframe加载成功: ${bestDomain.domain}`);
        } catch (error) {
            log(`iframe加载失败: ${error.message}`);
            showError('应用启动失败，请稍后重试');
        }
        
    } else {
        log('所有域名检测失败');
        showError('暂时无法连接到服务器');
    }
}

// 动态调整iframe高度（PWA模式优化）
function adjustIframeHeight() {
    if (!isPWAMode || !mainIframe) return;
    
    // 简化方案：直接使用100vh，让CSS padding处理安全区域
    mainIframe.style.top = '0';
    mainIframe.style.left = '0';
    mainIframe.style.right = '0';
    mainIframe.style.bottom = '0';
    mainIframe.style.width = '100%';
    mainIframe.style.height = '100vh';
    
    log(`PWA iframe调整: 使用100vh全屏显示`);
} 
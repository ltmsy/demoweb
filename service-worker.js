// PWA智能域名轮询系统 Service Worker
// 版本: 1.0.0

const CACHE_NAME = 'domain-router-v2.0.0';
const STATIC_CACHE_NAME = 'domain-router-static-v2.0.0';

// 核心文件列表（必须缓存）
const CORE_FILES = [
    './',
    './index.html',
    './manifest.json'
];

// 可选文件列表（尝试缓存，不影响安装）
const OPTIONAL_FILES = [
    './icon-192.png',
    './icon-512.png',
    './health-check.json'
];

// Service Worker 安装事件
self.addEventListener('install', event => {
    console.log('🔧 Service Worker 正在安装...');
    
    event.waitUntil(
        Promise.all([
            // 缓存核心文件
            caches.open(STATIC_CACHE_NAME).then(cache => {
                console.log('📦 正在缓存核心文件...');
                return cache.addAll(CORE_FILES);
            }),
            
            // 尝试缓存可选文件（不阻塞安装）
            caches.open(STATIC_CACHE_NAME).then(cache => {
                return Promise.allSettled(
                    OPTIONAL_FILES.map(file => {
                        return cache.add(file).catch(err => {
                            console.warn(`⚠️ 可选文件缓存失败: ${file}`, err.message);
                        });
                    })
                );
            })
        ]).then(() => {
            console.log('✅ Service Worker 安装完成');
            // 立即激活新版本
            return self.skipWaiting();
        }).catch(error => {
            console.error('❌ Service Worker 安装失败:', error);
        })
    );
});

// Service Worker 激活事件
self.addEventListener('activate', event => {
    console.log('🚀 Service Worker 正在激活...');
    
    event.waitUntil(
        Promise.all([
            // 清理旧版本缓存
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE_NAME) {
                            console.log('🗑️ 删除旧缓存:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            
            // 立即控制所有客户端
            self.clients.claim()
        ]).then(() => {
            console.log('✅ Service Worker 激活完成');
        })
    );
});

// 网络请求拦截
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    
    // 只处理GET请求
    if (request.method !== 'GET') {
        return;
    }
    
    // 跳过外部资源（除非是健康检查）
    if (url.origin !== self.location.origin && !isHealthCheckRequest(request)) {
        return;
    }
    
    event.respondWith(handleRequest(request));
});

// 判断是否是健康检查请求
function isHealthCheckRequest(request) {
    return request.url.includes('health-check.json');
}

// 处理网络请求
async function handleRequest(request) {
    const url = new URL(request.url);
    
    try {
        // 对于健康检查，总是从网络获取最新数据
        if (isHealthCheckRequest(request)) {
            return await networkOnly(request);
        }
        
        // 对于HTML页面，使用网络优先策略
        if (url.pathname === '/' || url.pathname.endsWith('.html')) {
            return await networkFirst(request);
        }
        
        // 对于静态资源，使用缓存优先策略
        if (isStaticResource(request)) {
            return await cacheFirst(request);
        }
        
        // 其他请求使用网络优先策略
        return await networkFirst(request);
        
    } catch (error) {
        console.error('❌ 请求处理失败:', error);
        return getFallbackResponse(request);
    }
}

// 判断是否是静态资源
function isStaticResource(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    return pathname.includes('.png') ||
           pathname.includes('.jpg') ||
           pathname.includes('.jpeg') ||
           pathname.includes('.svg') ||
           pathname.includes('.ico') ||
           pathname.includes('.css') ||
           pathname.includes('.js') ||
           pathname.includes('manifest.json');
}

// 网络优先策略
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        
        // 如果网络请求成功，更新缓存
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        // 网络失败，尝试从缓存获取
        console.log('🌐 网络请求失败，尝试缓存:', request.url);
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }
        throw error;
    }
}

// 缓存优先策略
async function cacheFirst(request) {
    const cached = await caches.match(request);
    
    if (cached) {
        // 后台更新缓存
        updateCache(request);
        return cached;
    }
    
    // 缓存中没有，从网络获取
    const response = await fetch(request);
    if (response.ok) {
        const cache = await caches.open(STATIC_CACHE_NAME);
        cache.put(request, response.clone());
    }
    
    return response;
}

// 仅网络策略
async function networkOnly(request) {
    return await fetch(request);
}

// 后台更新缓存
function updateCache(request) {
    fetch(request).then(response => {
        if (response.ok) {
            caches.open(STATIC_CACHE_NAME).then(cache => {
                cache.put(request, response);
            });
        }
    }).catch(() => {
        // 忽略后台更新错误
    });
}

// 获取后备响应
function getFallbackResponse(request) {
    const url = new URL(request.url);
    
    // 对于HTML请求，返回主页面
    if (request.headers.get('accept')?.includes('text/html')) {
        return caches.match('./index.html').then(response => {
            return response || new Response('页面暂时不可用', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: {
                    'Content-Type': 'text/html; charset=utf-8'
                }
            });
        });
    }
    
    // 对于API请求，返回JSON错误
    if (request.headers.get('accept')?.includes('application/json')) {
        return new Response(JSON.stringify({
            error: '服务暂时不可用',
            status: 'unavailable',
            timestamp: Date.now()
        }), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        });
    }
    
    // 默认错误响应
    return new Response('Service Unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {
            'Content-Type': 'text/plain; charset=utf-8'
        }
    });
}

// 消息处理
self.addEventListener('message', event => {
    const { type, data } = event.data || {};
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'GET_VERSION':
            event.ports[0]?.postMessage({
                version: CACHE_NAME,
                timestamp: Date.now()
            });
            break;
            
        case 'CLEAR_CACHE':
            clearAllCaches().then(() => {
                event.ports[0]?.postMessage({ success: true });
            }).catch(error => {
                event.ports[0]?.postMessage({ success: false, error: error.message });
            });
            break;
            
        case 'CACHE_STATUS':
            getCacheStatus().then(status => {
                event.ports[0]?.postMessage({ status });
            });
            break;
            
        default:
            console.log('📨 收到未知消息:', type, data);
    }
});

// 清理所有缓存
async function clearAllCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(
        cacheNames.map(name => caches.delete(name))
    );
    console.log('🗑️ 所有缓存已清除');
}

// 获取缓存状态
async function getCacheStatus() {
    const cacheNames = await caches.keys();
    const status = {};
    
    for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        status[name] = keys.length;
    }
    
    return status;
}

// 错误处理
self.addEventListener('error', event => {
    console.error('❌ Service Worker 错误:', event.error);
});

self.addEventListener('unhandledrejection', event => {
    console.error('❌ Service Worker 未处理的Promise拒绝:', event.reason);
});

// 推送通知处理（可选功能）
self.addEventListener('push', event => {
    if (event.data) {
        const options = {
            body: event.data.text() || '域名状态更新',
            icon: './icon-192.png',
            badge: './icon-192.png',
            vibrate: [100, 50, 100],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: 'domain-status'
            }
        };
        
        event.waitUntil(
            self.registration.showNotification('PWA域名轮询系统', options)
        );
    }
});

// 通知点击处理
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow('./')
    );
});

console.log('🎉 PWA域名轮询系统 Service Worker 加载完成'); 
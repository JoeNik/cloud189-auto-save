document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember').checked;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password, remember })
        });

        const data = await response.json();
        if (data.success) {
            window.location.href = '/index.html';
        } else {
            alert(data.error || '登录失败');
        }
    } catch (error) {
        alert('登录失败: ' + error.message);
    }
});

// 登出
async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST'
        });

        const data = await response.json();
        if (data.success) {
            window.location.href = '/login.html';
        }
    } catch (error) {
        alert('登出失败: ' + error.message);
    }
} 
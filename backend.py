from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from datetime import timedelta
import logging

logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__, template_folder="templates")
app.secret_key = 'supersecretkey' 
app.permanent_session_lifetime = timedelta(minutes=30)

# Veritabanı bağlantısını kapatıyoruz
# app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:tolga@localhost:5432/webgisFts'
# app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# db = SQLAlchemy(app)  # Veritabanını devre dışı bıraktık

@app.route('/', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        # Kullanıcı doğrulama yerine statik bir mesaj döndürüyoruz
        if username == "admin" and password == "admin":
            session['username'] = username
            session['role'] = 'admin'
            session.permanent = True
            logging.info(f"User {username} logged in as admin")
            return redirect(url_for('admin'))
        
        elif username == "user" and password == "user":
            session['username'] = username
            session['role'] = 'user'
            session.permanent = True
            logging.info(f"User {username} logged in as user")
            return redirect(url_for('user'))

        return render_template('index.html', error="Invalid username or password")

    return render_template('index.html')

@app.route('/logout')
def logout():
    logging.info(f"User {session.get('username')} logged out.")
    session.clear()
    return redirect(url_for('login'))

@app.route('/admin')
def admin():
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    return render_template('admin.html')

@app.route('/user')
def user():
    if 'role' not in session or session['role'] != 'user':
        return redirect(url_for('login'))
    return render_template('user.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'GET':
        return render_template('signup.html')

    username = request.form.get('username')
    password = request.form.get('password')

    if not username or not password:
        return "Username and password cannot be empty!", 400

    return "Sign up successful! You can now <a href='/'>login</a>."

if __name__ == '__main__':
    app.run(debug=True)

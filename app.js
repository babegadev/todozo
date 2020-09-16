const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const secure = require("ssl-express-www");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require("mongoose-findorcreate");
require("dotenv").config();

const app = express();
app.set("view engine", "ejs");
app.use(secure);
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// *************************** MONGOOSE CONNECTION *************************** //
const url = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_URL}/${process.env.DB_NAME}`;
mongoose.connect(url, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
});

// *************************** MONGOOSE SCHEMAS *************************** //
const todoSchema = new mongoose.Schema({
  todo: {
    type: String,
    required: true,
  },
});

const userSchema = new mongoose.Schema({
  name: String,
  googleId: String,
  todos: [todoSchema],
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

// *************************** MONGOOSE MODELS *************************** //
const Todo = mongoose.model("Todo", todoSchema);
const User = mongoose.model("User", userSchema);
passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

// *************************** GOOGLE STRATEGY *************************** //
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: process.env.CALLBACK_URL,
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    (accessToken, refreshToken, profile, cb) => {
      User.findOrCreate(
        { name: profile.name.givenName, googleId: profile.id },
        function (err, user) {
          return cb(err, user);
        }
      );
    }
  )
);

// ******************************** ROUTES ******************************** //
// ******** Authentication ******** //
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get(
  "/auth/google/todos",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    // * SUCCESSFULL REDIRECTION
    res.redirect("/");
  }
);

// ******** Root Render ******** //
app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    User.findById(req.user.id, (err, user) => {
      res.render("list", { title: `${user.name}'s`, items: user.todos });
    });
  } else {
    res.render("index");
  }
});

// ******** Create New Todo ******** //
app.post("/", (req, res) => {
  const itemName = req.body.item;
  const todo = new Todo({
    todo: itemName,
  });
  if (req.isAuthenticated()) {
    User.findById(req.user.id, (err, user) => {
      if (err) throw err;
      user.todos.push(todo);
      user.save(() => res.redirect("/"));
    });
  }
});

// ******** Delete Todo ******** //
app.post("/delete", (req, res) => {
  const checkedId = req.body.checkbox;
  User.findOneAndUpdate(
    { _id: req.user.id },
    { $pull: { todos: { _id: checkedId } } },
    (err, result) => {
      if (!err) res.redirect("/");
    }
  );
});

// ******** Authentication ******** //
app.get("/login", (req, res) => {
  if (req.isAuthenticated()) res.redirect("/");
  else res.render("login");
});
app.get("/register", (req, res) => {
  if (req.isAuthenticated()) res.redirect("/");
  else res.render("register");
});
app.get("/logout", (req, res) => {
  req.logout();
  res.redirect("/");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});

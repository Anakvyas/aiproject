const express =  require('express');
const app   =  express();
const path =  require('path');
const axios = require('axios');
engine = require('ejs-mate');
const mongoose = require('mongoose');
const LocalStrategy = require('passport-local')
const passport = require('passport')
const session = require('express-session');
const User = require('./model/user')
const {isregister,saveredirect} = require('./utils/middleware')
const Cart = require('./model/addtocart')
const MongoStore = require('connect-mongo');
const {deletereview} = require('./utils/middleware');
const product = require('./model/product');
const Rate = require('./model/review')
const methodOverride = require('method-override');

// ----------------------






//  middleware @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

app.set('view engine','ejs');
app.set('views',path.join(__dirname,'./views'));
app.use(express.static(path.join(__dirname,'public')));
app.engine('ejs', engine);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());




const bodyParser = require('body-parser');


app.use(bodyParser.urlencoded({ extended: true })); // For form submissions
app.use(bodyParser.json()); // For JSON payloads



app.use(methodOverride('_method'));

async function main() {
    await mongoose.connect('mongodb://127.0.0.1:27017/products');
}
main()
    .then(() => {
        console.log("connection successful");
    })
    .catch((err) => {
        console.log("ERROR IS : " + err);
    })


const sessionOptions = {
    secret: 'mySecretCode',
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days from now
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
        httpOnly: true,
    },
    store: MongoStore.create({
        mongoUrl: 'mongodb://localhost:27017/products'
    })
};
app.use(session(sessionOptions));  
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req,res,next)=>{
    res.locals.curruser = req.user;
    next();
})


// request-------------------------------------------------------------------------------------------------------------------



app.get('/home',async(req,res)=>{
    const products =  await product.find();
    res.render('home',{products});
})

app.get('/product/:id',async(req,res)=>{
    const {id } = req.params;
    let list = await product.findById(id).populate('review');
    res.render('show',{list});
})



// ----user request -----------------------------------------------------------------------------------------------
app.get('/signup',(async(req,res)=>{
    res.render("./user/signup.ejs")
}))

app.post('/signup',async(req,res)=>{
    try{
        const {username,email,password} = req.body
         const newUser = new User({username,email});
        const resultuser= await User.register(newUser,password);

        const r = req.login(resultuser,(err)=>{
            if(err){
                return next(err);
            };
        

        console.log(r);
        res.redirect('/home');
    });

    }catch(err){
        console.log(err);
        res.redirect('/signup');
    }
    }
);

app.get('/login',(async(req,res)=>{
    res.render("./user/login.ejs")
}))

app.post('/login',saveredirect,passport.authenticate('local', { failureRedirect: '/login'}), function(req, res) {
    if(res.locals.redirecturl){
       return  res.redirect(res.locals.redirecturl);
    }
    res.redirect('/home')
  
});


//log out
app.get('/logout',(req, res,next)=>{
    req.logout((err)=>{
        if(err){
            next(err);
        }
    });
    res.redirect('/home');
  });


// ----------------------------------------------------------------------------------------------------------------------------------------------


// Add to cart route
app.post('/addtocart/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.session.userId;

    let userCart = await Cart.findOne({ userId });
    if (!userCart) {
        userCart = new Cart({ userId, items: [] });
    }

    const productId = new mongoose.Types.ObjectId(id);

    // Check if the item already exists in the cart
    const item = userCart.items.find(item => item.productId && item.productId.equals(productId));

    if (item) {
        item.quantity += 1; 
    } else {
        userCart.items.push({ productId, quantity: 1 }); 
    }

    await userCart.save();
    res.redirect('/cart');
});




app.get('/cart', async (req, res) => {
    const userId = req.session.userId;
  
    const userCart = await Cart.findOne({ userId }).populate('items.productId');
    let Amount = 0;
    const cartItems = userCart ? userCart.items : [];
  

    cartItems.forEach(item => {
      Amount += item.productId.price * item.quantity;
    });
  
    res.render('cart', { cartItems, Amount });
  });
  

  app.post('/update-cart/:productId', async (req, res) => {
    const {productId} = req.params;
    const action = req.body.action; 
    const userId = req.session.userId;
  
    const userCart = await Cart.findOne({ userId });
    if (userCart) {
      const cartItem = userCart.items.find(item => item.productId.equals(productId));
  
      if (cartItem) {
        if (action === 'increment') {
          cartItem.quantity += 1;
        } else if (action === 'decrement') {
          cartItem.quantity -= 1;

           if (cartItem.quantity <= 0) {
            userCart.items = userCart.items.filter(item => !item.productId.equals(productId));
        }
        }
      }
  
      await userCart.save();
    }
  
    res.redirect('/cart');
  });
  

//-----------------------------------------------------------------------------------------------------------------


// review


// const validateRate = (req, res, next) => {
//     let { error } = reviewSchema.validate(req.body);
//     if (error) {
//         throw new ExpressError(400, error);
//     } else {
//         next();
//     }
// }


// for review - rating post 




app.delete('/product/:id/review/:reviewid',isregister,(async(req,res)=>{
    let {id,reviewid} = req.params;
    await product.findByIdAndUpdate(id, {$pull:{review : reviewid}});       
    await Rate.findByIdAndDelete(reviewid);
    res.redirect(`/product/${id}`);
}))





////// review -----------------------------------------------------------------------------------------------------------------\
app.post('/product/:id/review', isregister, async (req, res) => {
    console.log(req.body); // Log the request body
    const { id } = req.params;
    const { content, rating } = req.body.Rate; // Adjust this if necessary

    if (!content) {
        return res.status(400).json({ error: "Content cannot be empty" });
    }
    try {
        // Find the product by ID
        const post = await product.findById(id);
        
        // Create a new review
        const body = new Rate({
            content,
            rating,
            author: req.user.username // Use the username from the logged-in user
        });

        // Call Python API for fake/real prediction
        console.log({ content });
const response = await axios.post('http://localhost:5000/predict', { content });
        const isFake = response.data.isFake;





        // Save the review with the prediction
        body.isFake = isFake;
        await body.save();

        // Add the review to the product
        post.review.push(body);
        await post.save();

        // Fetch all reviews by the user for rendering
        const reviews = await Rate.find({ author: req.user.username });

        // Count fake and real reviews for pie chart
        const totalReviews = reviews.length;
        const fakeReviews = reviews.filter(r => r.isFake).length;
        const realReviews = totalReviews - fakeReviews;

        // Render the page with reviews and statistics
        res.render('reviews', {
            reviews,
            totalReviews,
            fakeReviews,
            realReviews
        });
    } catch (error) {
        console.error('Error handling review submission:', error);
        res.status(500).json({ message: 'An error occurred while submitting the review.' });
    }
});


// Route to see reviews and analysis
app.get('/see-reviews', async (req, res) => {
    const reviews = await Rate.find({ author: req.user._id });

    // Count fake and real reviews for pie chart
    const totalReviews = reviews.length;
    const fakeReviews = reviews.filter(r => r.isFake).length;
    const realReviews = totalReviews - fakeReviews;

    res.render('reviews', {
        reviews,
        totalReviews,
        fakeReviews,
        realReviews
    });
});




const port  =  3000;
app.listen(port,()=>{
    console.log("Port is running successfully");
})
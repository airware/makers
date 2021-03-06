'use strict';

const Author     = require('./lib/Author'),
    Page         = require('./lib/Page'),
    Post         = require('./lib/Post'),
    argv         = require('yargs').argv,
    del          = require('del'),
    express      = require('express'),
    extend       = require('jquery-extend'),
    fs           = require('fs'),
    g            = require('gulp-load-plugins')(),
    gulp         = require('gulp'),
    hb           = require('handlebars'),
    highlight    = require('highlight.js'),
    layouts      = require('handlebars-layouts'),
    moment       = require('moment'),
    path         = require('path'),
    reviewerList = require('./lib/hb-helper-reviewerlist'),
    rules        = require('@airware/eslint-rules');


// Config HB
layouts.register(hb);
hb.registerHelper('reviewerList', reviewerList);


// Shared data object for passing between tasks
let data;


// Clean data and build dirs
gulp.task('clean', done => {
    fs.readFile('src/data/careers.json', 'utf-8', (err, careers) => {
        if (err) throw err;

        data = {
            authors   : [], // Populated by 'authors' task
            posts     : [], // Populated by 'posts' task
            tags      : [], // Populated by 'posts' task
            careers   : JSON.parse(careers),
            pageTitle : 'Airware Makers',
            year      : moment().format('YYYY'),
            timestamp : moment().format('YYYY-MM-DD-HH-mm-ss')
        };

        if (process.env.TRAVIS_BRANCH == undefined) {
            data.env = 'local';
        } else if (process.env.TRAVIS_BRANCH != 'master') {
            data.env = process.env.TRAVIS_BRANCH;
        }

        del([
            'build/**',
            '!build'
        ]).then(done());
    });
});


// Copy font files to build dir
gulp.task('fonts', () => {
    return gulp.src('node_modules/font-awesome/fonts/*')
        .pipe(gulp.dest('build/fonts'));
});


// Copy static files to build dir
gulp.task('static', () => {
    return gulp.src('src/static/**')
        .pipe(g.if('robots.txt', g.tap(file => {
            if (process.env.TRAVIS_BRANCH == 'master') {
                file.contents = new Buffer('');
            }
        })))
        .pipe(gulp.dest('build'));
});


// Minify and combine all CSS
gulp.task('styles', () => {
    return gulp.src([
        'node_modules/bootstrap/dist/css/bootstrap.css',
        'node_modules/highlight.js/styles/default.css',
        'node_modules/font-awesome/css/font-awesome.css',
        'src/less/custom.less'
    ])
    .pipe(g.sourcemaps.init({ loadMaps : true }))
    .pipe(g.if('*.less', g.less()))
    .pipe(g.concat('all.min.css'))
    .pipe(g.cssnano())
    .pipe(g.sourcemaps.write('.'))
    .pipe(gulp.dest('build/css'));
});

// Minify and combine all JavaScript
gulp.task('scripts', () => {
    return gulp.src([
        'node_modules/ua-parser-js/dist/ua-parser.min.js',
        'node_modules/jquery/dist/jquery.js',
        'node_modules/velocity-animate/velocity.js',
        'node_modules/velocity-animate/velocity.ui.js',
        'node_modules/hammerjs/hammer.js',
        'node_modules/jquery-hammerjs/jquery.hammer.js',
        'node_modules/bootstrap/dist/js/bootstrap.js',
        'node_modules/trianglify/dist/trianglify.min.js',
        'src/js/*.js'
    ])
    .pipe(g.sourcemaps.init({ loadMaps : true }))
    .pipe(g.babel({
        presets  : [ 'es2015' ],
        comments : true,
        compact  : false
    }))
    .pipe(g.concat('all.min.js'))
    .pipe(g.uglify({ preserveComments : 'some' }))
    .pipe(g.sourcemaps.write('.'))
    .pipe(gulp.dest('build/js'));
});


// Register HB partials
gulp.task('partials', () => {
    return gulp.src('src/partials/*.html')
        .pipe(g.tap(file => {
            hb.registerPartial(path.parse(file.path).name, file.contents.toString());
        }));
});


// Load authors and make pages
gulp.task('authors', done => {
    fs.readFile('src/partials/author.html', 'utf-8', (err, str) => {
        if (err) throw err;
        const template = hb.compile(str);

        gulp.src('src/authors/*.md')
            .pipe(g.frontMatter())
            .pipe(g.marked())
            .pipe(g.tap(file => {
                const author = new Author(extend(true, {}, file.frontMatter, {
                    bio       : file.contents.toString(),
                    path      : file.path,
                    content   : file.contents.toString(),
                    env       : data.env,
                    pageTitle : data.pageTitle
                }));

                // Populate the authors collection for re-use
                data.authors.push(author);

                // Alter the path, write the rendered template, and put back in stream
                file.path = author.path;
                file.contents = new Buffer(template(author));
            }))
            .pipe(g.htmlmin({ collapseWhitespace : true }))
            .pipe(gulp.dest('build'))
            .on('end', done);
    });
});


// Generate posts
gulp.task('posts', done => {
    fs.readFile('src/partials/post.html', 'utf-8', (err, str) => {
        if (err) throw err;
        const template = hb.compile(str);

        gulp.src('src/posts/*.md')
            .pipe(g.frontMatter())
            .pipe(g.marked({
                highlight : code => {
                    return highlight.highlightAuto(code).value;
                }
            }))
            .pipe(g.tap(file => {
                const post = new Post(extend(true, {}, file.frontMatter, {
                    path      : file.path,
                    content   : file.contents.toString(),
                    env       : data.env,
                    authors   : data.authors,
                    careers   : data.careers,
                    pageTitle : data.pageTitle,
                    year      : data.year,
                    timestamp : data.timestamp
                }));

                // Populate the posts collection for reuse
                data.posts.push(post);

                // Alter the path, write the rendered template, and put back in stream
                file.path = post.path;
                file.contents = new Buffer(template(post));
            }))
            .pipe(g.htmlmin({ collapseWhitespace : true }))
            .pipe(gulp.dest('build'))
            .on('end', () => {
                // Sort posts by date descending
                data.posts.sort((a, b) => {
                    return moment(a.date).format('X') < moment(b.date).format('X'); // DESC
                });
                done();
            });
    });
});


// Generate posts
gulp.task('pages', done => {
    fs.readFile('src/partials/rss.xml', 'utf-8', (err, rssStr) => {
        if (err) throw err;
        const rssTemplate = hb.compile(rssStr);

        gulp.src('src/pages/**/*.html')
            .pipe(g.frontMatter())
            .pipe(g.tap(file => {
                file.data = new Page(extend(true, {}, file.frontMatter, {
                    path      : file.path,
                    posts     : data.posts,
                    env       : data.env,
                    year      : data.year,
                    careers   : data.careers,
                    timestamp : data.timestamp,
                    pageTitle : data.pageTitle
                }));
                file.path = file.data.path;
                const template = hb.compile(file.contents.toString());
                file.contents = new Buffer(template(file.data));
            }))
            .pipe(g.htmlmin({ collapseWhitespace : true }))
            .pipe(gulp.dest('build'))
            .pipe(g.filter(file => {
                return file.data.rss;
            }))
            .pipe(g.tap(file => {
                file.path = file.data.rssPath;
                file.contents = new Buffer(rssTemplate(file.data));
            }))
            .pipe(gulp.dest('build'))
            .on('end', done);
    });
});


// Run tests and product coverage
gulp.task('test', () => {
    return gulp.src('test/*.js')
        .pipe(g.mocha({
            require : [ 'should' ]
        }));
});


// Lint as JS files (including this one)
gulp.task('lint', () => {
    return gulp.src([
        'gulpfile.js',
        'src/js/*.js',
        'test/*.js',
        'lib/*.js',
        '!node_modules/**'
    ])
    .pipe(g.eslint({
        extends       : 'eslint:recommended',
        env           : [ 'node', 'mocha' ],
        globals       : [ '$', 'window', 'document', 'ga', 'UAParser' ],
        parserOptions : { 'ecmaVersion' : 6 },
        rules
    }))
    .pipe(g.eslint.format());
});


// Serve files for local development
gulp.task('serve', done => {
    const port = argv.p || 3000;

    express()
        .use(express.static('build'))
        .use((req, res) => {
            res.status(404)
                .sendFile(path.join(__dirname, '/build/error.html'));
        })
        .listen(port, () => {
            g.util.log('Server listening on port', port);
            done();
        });
});


// Check deps with David service
gulp.task('deps', () => {
    return gulp.src('package.json')
        .pipe(g.david());
});


// Examine package.json for unused deps (except for frontend and gulp)
gulp.task('package', g.depcheck({
    ignoreMatches : [
        '@airware/eslint-rules',
        'babel-preset-es2015',
        'bootstrap',
        'font-awesome',
        'gulp-*',
        'hammerjs',
        'jquery-hammerjs',
        'jquery',
        'should',
        'velocity-animate',
        'ua-parser-js',
        'trianglify'
    ]
}));


// Watch certain files
gulp.task('watch', () => {
    const paths = [
        'src/**/*.*',
        'test/*.js',
        'lib/*.js'
    ];

    gulp.watch(paths, [ 'build' ])
        .on('change', e => {
            g.util.log('File', e.path, 'was', e.type);
        });
});


// Build Macro
gulp.task('build', done => {
    g.sequence(
        'clean',
        [ 'fonts', 'static', 'styles', 'scripts', 'partials' ],
        'authors',
        'posts',
        'pages',
        'test',
        'lint'
    )(done);
});


// Deploy to AWS S3
gulp.task('deploy', () => {
    const publisher = g.awspublish.create({
        accessKeyId     : process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey : process.env.AWS_SECRET_ACCESS_KEY,
        region          : 'us-east-1',
        params          : { Bucket : argv.b }
    });

    return gulp.src('build/**')
        .pipe(g.awspublish.gzip())
        .pipe(publisher.publish())
        .pipe(publisher.sync())
        .pipe(g.awspublish.reporter());
});


// What to do when you run `$ gulp`
gulp.task('default', done => {
    g.sequence(
        'deps',
        'package',
        'build',
        'watch',
        'serve'
    )(done);
});

/* config */
var PROXY_ADDR = 'coachellalp.dev',
	ASSET_PATH = 'assets';
	
var globs = {
	js: [
		ASSET_PATH + '/scripts/**/*.js',
	],
	less: [
		ASSET_PATH + '/styles/**/*.less',
		'!' + ASSET_PATH + '/styles/**/*.inc.less',
	],
	files: [
		'**/.htaccess',
		'**/*.+(html|php|jpg|jpeg|gif|png)',
	],
};
var dests = {
	js:   ASSET_PATH + '/js',
	less: ASSET_PATH + '/css',
}

/* includes */
var gulp         = require('gulp'),
	gutil        = require('gulp-util'),
	rename       = require('gulp-rename'),
	modRewrite   = require('connect-modrewrite'),
	
	// watching
	browserSync  = require('browser-sync'),
		
	// js
	concat       = require('gulp-concat'),
	uglify       = require('gulp-uglify'),
	ngAnnotate   = require('gulp-ng-annotate'),
	
	// css
	less         = require('gulp-less'),
	autoprefixer = require('gulp-autoprefixer'),
	minifyCss    = require('gulp-minify-css');


/* tasks */
gulp
	// build
	.task('js', function(){
		return gulp.src(globs.js)
			.pipe(concat('base.js'))
			.pipe(ngAnnotate())
			.pipe(gulp.dest(dests.js))
			
			.pipe(rename({suffix: '.min'}))
			.pipe(uglify())
			.pipe(gulp.dest(dests.js))
			
			.pipe(browserSync.reload({stream:true}));
	})
	.task('less', function(){
		return gulp.src(globs.less.concat(['!' + ASSET_PATH + '/less/**/*.inc.less']))
			.pipe(less())
			.pipe(autoprefixer('last 2 versions'))
			.pipe(minifyCss())
			.pipe(gulp.dest(dests.less))
			
			.pipe(browserSync.reload({stream:true}));
	})
	.task('build', ['js','less'])
	
	
	// watch
	.task('js.watch', ['js'], function(){
		gulp.watch(globs.js, ['js']);
	})
	.task('less.watch', ['less'], function(){
		gulp.watch(globs.less, ['less']);
	})
	.task('watch', ['js.watch','less.watch'], function(){
		browserSync.init({
			files: globs.files,
			//proxy: PROXY_ADDR,
			server: {
				baseDir: './',
				middleware: [
					modRewrite([
						'!\\.(html|js|css|png|jpe?g|gif)$ /index.html [L,NC]'
					]),
				],
			},
			watchOptions: {debounce: 400},
			ghostMode: false,
			notify: false,
			open: !! gutil.env.open, // call `gulp --open` to start gulp and also open a new browser window
		});
	})
	
	// default
	.task('default', ['watch'])
	
angular.module('firebaseHelper', ['firebase'])

	.service('$firebaseHelper', ['$firebase', '$q', function($firebase, $q){
		var self      = this,
			namespace = '',
			cached    = {};
		
		// get or set namespace/Firebase reference domain
		self.namespace = function(set){
			if(set !== undefined) namespace = set;
			return namespace;
		};
		
		// returns: Reference
		self.$ref = function(){
			var args = Array.prototype.slice.call(arguments);
			
			var path = 'Ref/' + args.join('/');
			if(cached[path]) return cached[path];
			
			var $ref = new Firebase('https://' + namespace + '.firebaseio.com/' + (args.join('/') || ''));
			cached[path] = $ref;
			
			return $ref;
		};
		
		// returns: Instance
		self.$inst = function(){
			if(arguments.length == 1 && arguments[0] instanceof Firebase){
				// accept/handle firebase $ref as argument too, not just string(s)
				var ref  = arguments[0],
					path = 'Inst' + ref.path;
				
				if(cached[path]) return cached[path];
				
				var $inst = $firebase(ref);
				cached[path] = $inst;
			
				return $inst;
			}else{
				// handle string(s)
				var args = Array.prototype.slice.call(arguments),
					path = 'Inst/' + args.join('/');
				if(cached[path]) return cached[path];
				
				var $inst = $firebase(self.$ref.apply(this, args));
				cached[path] = $inst;
			
				return $inst;
			}
		};
		
		// returns: Object or Array
		// i.e. if last argument === true, return Array instead of Object
		self.$get = function(){
			var args = Array.prototype.slice.call(arguments),
				type = 'Object';
			
			if(args[args.length - 1] === true){
				type = 'Array';
				args.pop();
			}
			
			// retrieve cached item, if possible
			var path = type + '/' + args.join('/');
			if(cached[path]) return cached[path];
			
			// retrieve from remote, then cache it for later
			var $get = self.$inst.apply(this, args)['$as'+type]();
			cached[path] = $get;
			
			return $get;
		};
		
		// returns: promise for Object or Array
		self.$load = function(){
			return self.$get.apply(this, arguments).$loaded();
		};
		
		// returns: Instance
		self.$child = function(){
			var args = Array.prototype.slice.call(arguments),
				parent = args.shift();
			
			if(angular.isFunction(parent.$inst)){ // it's a Firebase Object or Array
				parent = parent.$inst();
			}
			if(angular.isFunction(parent.$ref)){ // it's a Firebase Instance
				parent = parent.$ref();
			}
			if(angular.isFunction(parent.child)){ // it's a Firebase Reference
				return self.$inst(parent.child(args.join('/')));
			}
			return parent; // fallback to parent
		};
		
		self.$populate = function(keys, values, cbAdded){
			var array   = [],
				keysRef = self.$ref(keys);
			
			// fire callback even if no keys found
			keysRef.once('value', function(snapshot){
				if( ! angular.isObject(snapshot.val())){
					if(angular.isFunction(cbAdded)) cbAdded();
				}
			});
			
			// watch for additions/deletions at keysRef
			keysRef.on('child_added', function(snapshot){
				var $item = self.$get(values, snapshot.name());
				
				$item.$loaded().then(function(){
					var deferreds = [];
					if(angular.isFunction(cbAdded)) deferreds.push(cbAdded($item));
					
					$q.all(deferreds).then(function(){
						array.push($item);
					});
				});
			});
			keysRef.on('child_removed', function(snapshot){
				array.splice($rootScope.childById(array, snapshot.name(), undefined, true), 1);
			});
			return array;
		};
		
		// @requires: external Firebase.util library: https://github.com/firebase/firebase-util
		self.$intersect = function(keysPath, valuesPath, keysMap, valuesMap){
			if( ! Firebase.util) throw new Error('$firebaseHelper.$intersect requires Firebase.util external library. See: https://github.com/firebase/firebase-util');
			
			// @TODO: cache somehow
			
			var keysObj   = {ref: self.$ref(keysPath)},
				valuesObj = {ref: self.$ref(valuesPath)};
			
			if(keysMap)   keysObj.keyMap   = keysMap;
			if(valuesMap) valuesObj.keyMap = valuesMap;
			
			return $firebase(Firebase.util.intersection(keysObj, valuesObj)).$asArray();
		};
		
		return self;
	}]);
angular.module('coachella', ['ui.router', 'ui.bootstrap', 'firebase', 'firebaseHelper'])
	
	.config(["$locationProvider", "$urlRouterProvider", "$stateProvider", function($locationProvider, $urlRouterProvider, $stateProvider){
		$locationProvider.html5Mode(true);
		$urlRouterProvider.when('',  '/');
		$urlRouterProvider.when('/', '/2014');
		$stateProvider
			// pages
			.state('year', {
				url: '/:year',
				templateUrl: 'views/year.html',
			})
				.state('year:edit', {
					url: '/:year/edit',
					templateUrl: 'views/edit.html',
					resolve: {
						isAdmin: ["$rootScope", "$q", function($rootScope, $q){
							var deferred = $q.defer();
							
							$rootScope.$auth.$getCurrentUser().then(function(user){
								if(user && user.uid == 'facebook:120605287'){
									deferred.resolve();
								}else{
									deferred.reject();
								}
							});
							
							return deferred.promise;
						}],
					},
				});
	}])
	
	.controller('AppCtrl', ["$rootScope", "$state", "$firebase", "$firebaseHelper", "$firebaseSimpleLogin", function($rootScope, $state, $firebase, $firebaseHelper, $firebaseSimpleLogin){
		$firebaseHelper.namespace('coachellalp');
		$rootScope.$state = $state;
		$rootScope.$auth  = $firebaseSimpleLogin($firebaseHelper.$ref());
		
		$rootScope.$on('$firebaseSimpleLogin:login', function(e, user){
			$firebaseHelper.$ref('users/' + user.uid).set(user);
		});
		
		$rootScope.$on('$stateChangeSuccess', function(){
			$rootScope.year = $rootScope.$state.params.year;
			
			$rootScope.bands = $firebaseHelper.$get('bands/' + $rootScope.year, true);
			$rootScope.users = $firebaseHelper.$get('users');
		});
	}])
	.controller('BandsCtrl', ["$scope", "$firebaseHelper", function($scope, $firebaseHelper){
		$scope.vote = function(band_id, vote){
			var save = function(){
				var $item = $firebaseHelper.$child($scope.bands, band_id + '/votes/' + $scope.$auth.user.uid + '/vote')
				$item.$asObject().$loaded().then(function(item){
					if(item.$value == vote){
						$item.$remove();
					} else {
						$item.$set(vote);
					}
				});
			}
			if ( ! $scope.$auth.user){
				$scope.$auth.$login('facebook').then(function(user){
					save();
				}, function(error){
					console.error(error);
				});
			}else{
				save();
			}
		};
		$scope.mustsee = function(band_id){
			var save = function(){
				var $item = $firebaseHelper.$child($scope.bands, band_id + '/mustsee/' + $scope.$auth.user.uid + '/mustsee')
				$item.$asObject().$loaded().then(function(item){
					if(item.$value){
						$item.$set(false);
					} else {
						$item.$set(true);
					}
				});
			}
			if ( ! $scope.$auth.user){
				$scope.$auth.$login('facebook').then(function(user){
					save();
				}, function(error){
					console.error(error);
				});
			}else{
				save();
			}
		};
		
		$scope.orderBy     = undefined;
		$scope.orderByStr  = undefined;
		$scope.orderByDir  = undefined;
		$scope.toggleOrder = function(key){
			if($scope.orderByStr == key) $scope.orderByDir = ! $scope.orderByDir;
			$scope.orderByStr = key;
			switch(key){
				case 'mustsee':
					key = function(item){
						var length = 0;
						if(item.mustsee){
							for(var i in item.mustsee) length++;
						}
						return length;
					};
					break;
				case 'votes':
					key = function(item){
						var length = 0;
						if(item.votes){
							for(var i in item.votes) length++;
						}
						return length;
					};
					break;
				case 'vote':
					key = function(item){
						var order = -2;
						if(item.votes){
							angular.forEach(item.votes, function(vote, user_uid){
								if(user_uid == $scope.$auth.user.uid) order = vote.vote;
							});
						}
						return order;
					};
					break;
			}
			$scope.orderBy = key;
		};
		$scope.filterDay = 0;
	}])
	.controller('BandCtrl', ["$scope", function($scope){
		$scope.init = function(band){
			$scope.data = band;
		};
		$scope.$watch('data.votes', function(votes){
			var total = 0;
			angular.forEach(votes, function(item){
				total += item.vote;
			});
			$scope.data = $scope.data || {};
			return $scope.data.score = total;
		});
		
		$scope.add = function(band){
			if(band && band.name && band.day){
				$scope.bands.$add(band).then(function(){
					// reset it
					band.name    = '';
					
					// focus on input so we can quickly add more
					$scope.added = true;
				});
			}
		};
		$scope.remove = function(band, skipConfirm){
			if(band && band.$id && (skipConfirm || confirm('Are you sure you want to permanently delete this?'))){
				$scope.bands.$remove(band);
			}
		};
	}])
	
	.directive('ngAutofocus', function(){
		return {
			restrict: 'A',
			link: function(scope, element, attrs){
				scope.$watch(function(){
					return scope.$eval(attrs.ngAutofocus);
				},function (v){
					if(v) element[0].focus();//use focus function instead of autofocus attribute to avoid cross browser problem. And autofocus should only be used to mark an element to be focused when page loads.
				});
			}
		};
	})
angular.module('coachella', ['ui.router', 'ui.bootstrap', 'firebase', 'firebaseHelper'])
	
	.config(function($locationProvider, $urlRouterProvider, $stateProvider){
		$urlRouterProvider.when('',  '/');
		$urlRouterProvider.when('/', '/2015'); // default to current year
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
						isAdmin: function($rootScope, $q){
							var deferred = $q.defer();
							
							$rootScope.$auth.$getCurrentUser().then(function(user){
								if(user && user.uid == 'facebook:120605287'){
									deferred.resolve();
								}else{
									deferred.reject();
								}
							});
							
							return deferred.promise;
						},
					},
				});
	})
	
	.controller('AppCtrl', function($rootScope, $state, $firebase, $firebaseHelper, $firebaseSimpleLogin){
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
	})
	.controller('BandsCtrl', function($scope, $firebaseHelper){
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
		
		$scope.filterDay   = 0;
		$scope.orderBy     = undefined;
		$scope.orderByStr  = undefined;
		$scope.orderByDir  = false;
		$scope.toggleOrder = function(key){
			if(key){
				var defaultOrderByDirs = {
					day: false,
					name: false,
					vote: true,
					score: true,
				};
				if($scope.orderByStr == key){ // already sorting by this key
					if($scope.orderByDir === defaultOrderByDirs[key]){ // we haven't yet flipped direction
						$scope.orderByDir = ! $scope.orderByDir; // flip direction
					}else{// we've already flipped direction
						// clear the sorting to default
						return $scope.toggleOrder();
					}
				}else{ // sorting by new key
					$scope.orderByDir = defaultOrderByDirs[key]; // sort by default direction
				}
			}
			
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
/*
				case 'votes':
					key = function(item){
						var length = 0;
						if(item.votes){
							for(var i in item.votes) length++;
						}
						return length;
					};
					break;
*/
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
				case undefined:
					$scope.orderBy    = ['day','$id'];
					$scope.orderByDir = false;
					return;
				case 'day':
					$scope.orderBy    = ['day','name'];
					return;
			}
			$scope.orderBy = key;
		};
		$scope.toggleOrder();
	})
	.controller('BandCtrl', function($scope){
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
	})
	
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